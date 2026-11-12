#!/bin/sh
# Start a Claude implementer for one task in its own worktree and Herdr pane.
# Usage: scripts/delegate.sh <T-xxx-slug> <agent-name> [extra instructions]
# Run from the orchestrator's pane. Prints: <agent-name> <pane-id> <worktree-path>
set -eu

[ "${HERDR_ENV:-}" = 1 ] || { echo "not running inside Herdr" >&2; exit 1; }
[ $# -ge 2 ] || { echo "usage: $0 <T-xxx-slug> <agent-name> [extra instructions]" >&2; exit 2; }
slug=$1
name=$2
extra=${3:-}
root=$(git rev-parse --show-toplevel)

[ -f "$root/docs/tasks/$slug.md" ] || { echo "no task file docs/tasks/$slug.md" >&2; exit 1; }
grep -q '^- 상태: ready' "$root/docs/tasks/$slug.md" || { echo "task $slug is not ready (needs user review)" >&2; exit 1; }

wt=$("$root/scripts/task-worktree.sh" "$slug" | tail -1)

pane_id() { python3 -I -c 'import sys, json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])'; }

# Put implementers in a column to the right of the orchestrator: the first split goes right,
# later ones stack below the newest implementer pane.
# Ask Herdr where this pane is now. The HERDR_* variables keep the IDs from when the shell
# started, so they point at the old workspace after the pane has been moved.
here=$(herdr pane current --current | python3 -I -c '
import sys, json
p = json.load(sys.stdin)["result"]["pane"]
print(p["pane_id"], p["workspace_id"])')
my_pane=${here% *}
my_workspace=${here#* }
last=$(herdr pane list --workspace "$my_workspace" | MY_PANE="$my_pane" python3 -I -c '
import sys, json, os
panes = [p["pane_id"] for p in json.load(sys.stdin)["result"]["panes"] if p["pane_id"] != os.environ["MY_PANE"]]
print(panes[-1] if panes else "")')
if [ -n "$last" ]; then
  pane=$(herdr pane split "$last" --direction down --cwd "$wt" --no-focus | pane_id)
else
  pane=$(herdr pane split "$my_pane" --direction right --cwd "$wt" --no-focus | pane_id)
fi

herdr agent start "$name" --kind claude --pane "$pane" -- --permission-mode acceptEdits >/dev/null

prompt="역할: 구현자. AGENTS.md를 읽고 따르세요. task: docs/tasks/$slug.md. 지금 있는 worktree(브랜치 task/$slug)에서 범위 안의 작업만 하세요. $extra
도구 규칙: 파일을 살펴보거나 고칠 때는 Read, Glob, Grep, Write, Edit 도구를 쓰세요. 셸은 pnpm, cargo, git(status, diff, log, add, commit) 명령을 하나씩 실행할 때만 쓰고 ; 나 && 로 묶지 마세요. 그 밖의 명령(파일 삭제, 화면 캡처, 빌드된 앱 직접 실행, curl, gh, worktree 밖 파일 읽기)은 승인 대기로 멈추니 실행하지 말고 필요하면 보고에 적으세요. 선택형 질문 UI는 쓰지 마세요. 사용자는 MVP가 완성된 뒤에 한꺼번에 확인하므로, 제품·디자인 판단은 README와 docs/decisions 를 근거로 직접 정하고 작업 기록에 가정으로 적으세요. 범위를 바꿔야 하는 문제만 멈춰서 보고하세요.
다른 구현자가 동시에 다른 worktree에서 작업할 수 있습니다. 충돌을 피하려고 AGENTS.md와 docs/tasks/README.md는 고치지 말고, 코드 구조 절에 추가할 내용은 보고에 적으세요.
끝나면 pnpm check 와 pnpm tauri build 를 실행하고, 모두 통과하면 task 파일의 작업 기록을 채우고 커밋하세요. 푸시와 PR은 하지 마세요. 마지막에 AGENTS.md의 완료 보고 형식으로 보고하세요."

herdr agent prompt "$name" "$prompt" >/dev/null
echo "$name $pane $wt"
