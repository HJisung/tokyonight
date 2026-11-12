# 개발 하네스

사용자가 대략적인 작업을 전달하면 오케스트레이터가 목표·범위·완료 기준을 구체화하고, Herdr pane의 다른 에이전트에게 구현과 리뷰를 맡기는 방식입니다. 공통 규칙은 [`AGENTS.md`](../AGENTS.md)에 있습니다.

> 이 문서의 위임 절차는 Herdr 0.9.5 도움말을 바탕으로 썼고 아직 실제로 돌려 보지 않았습니다. T-002에서 검증하고 고칩니다.

## 구조

```
사용자
  │  대략적인 작업, 결정, 승인
  ▼
오케스트레이터 (Claude Code, 사용자와 대화하는 pane)
  │  docs/tasks/T-xxx.md 를 구체화 (목표·범위·완료 기준)
  ├──────────────► 구현자 (Claude Code, 옆 pane)
  │   task 파일      전용 worktree·브랜치에서 구현, 통과 시 커밋
  │◄──────────────
  ├──────────────► 리뷰어 (Codex 또는 별도 Claude, 옆 pane)
  │   task + diff    읽기 전용 검토, 문제만 보고
  │◄──────────────
  ▼
오케스트레이터가 직접 검증 → develop에 병합, 브랜치 삭제 → 사용자에게 보고
```

| 역할 | 실행 주체 | 하는 일 | 하지 않는 일 |
| --- | --- | --- | --- |
| 사용자 | 사람 | 방향 제시, 제품 결정, task 검수, release·main 병합과 설치 승인 | |
| 오케스트레이터 | Claude Code | task 구체화, 위임, 코드 검토와 검증, 푸시·PR·`develop` 병합, task 상태 관리 | 큰 구현을 직접 하기 |
| 구현자 | Claude Code (Herdr pane) | task 하나 구현, 검증 명령 실행, 커밋, 보고 | 범위 밖 수정, 푸시, PR, 병합 |
| 리뷰어 | Codex, 불가 시 별도 Claude Code (Herdr pane) | 완료 기준·diff 대조 검토 | 코드 수정 |

구현과 리뷰를 서로 다른 모델에 맡기는 이유는 같은 맹점을 공유하지 않게 하기 위해서입니다.

> 2026-11-12 현재 Codex 사용량이 소진되어 리뷰어도 Claude Code가 맡습니다. 구현자와 같은 pane·같은 대화를 쓰지 않고 새 세션으로 시작해 task 파일과 diff만 보게 합니다. Codex를 다시 쓸 수 있게 되면 리뷰어를 Codex로 되돌립니다.

## 저장소 안의 하네스 파일

| 경로 | 용도 |
| --- | --- |
| `AGENTS.md` | 모든 에이전트의 공통 규칙. Codex가 자동으로 읽습니다. |
| `CLAUDE.md` | `AGENTS.md`를 가져오고 Claude Code 전용 규칙을 덧붙입니다. |
| `docs/harness.md` | 이 문서. 역할, 작업 흐름, 위임 절차. |
| `docs/tasks/` | task별 파일과 목록(`README.md`). 위임의 단위입니다. |
| `docs/decisions/` | 결정 기록. M1 task의 산출물입니다. |
| `docs/design/` | 화면 구성, 아키텍처 설계. |

## 작업 흐름

1. **접수**: 사용자가 작업을 말합니다. 대략적인 한 줄이어도 됩니다. 오케스트레이터는 해당 task 파일을 찾거나 `_template.md`로 새로 만듭니다. 요청이 여러 작업을 담고 있으면 task를 나눕니다.
2. **구체화**: 오케스트레이터가 코드와 문서를 읽고 목표, 범위, 범위 밖, 완료 기준을 직접 채웁니다. 사용자의 말에서 추측한 부분은 추측이라고 표시합니다. 상태 `proposed`.
3. **검수**: 사용자에게 task를 보여 줍니다. 무엇을 만들고 무엇을 만들지 않는지, 끝났는지를 어떻게 확인하는지, 사용자가 정해야 하는 것을 짧게 요약합니다. 사용자가 고치라고 하면 고쳐서 다시 보여 줍니다. 승인하면 `검수: 승인 (날짜)`를 적고 상태를 `ready`로 바꿉니다. **승인 없이는 다음 단계로 가지 않습니다.**
4. **위임**: 의존 task가 `done`인지 확인하고 구현자에게 보냅니다. 상태 `in-progress`.
5. **구현**: 구현자가 자기 worktree의 `task/T-xxx-slug` 브랜치에서 작업합니다. 검증 명령과 빌드가 통과하면 묻지 않고 커밋한 뒤 완료 보고 형식으로 보고합니다. 푸시와 PR은 하지 않습니다.
6. **리뷰**: 리뷰어에게 task 파일과 diff를 검토시킵니다. 상태 `review`. 문제가 나오면 구현자에게 돌려보냅니다.
7. **검증·PR**: 오케스트레이터가 diff를 직접 읽고, 검증 명령을 다시 실행하고, 완료 기준을 하나씩 확인합니다. 구현자의 보고만으로 완료 처리하지 않습니다. 통과하면 브랜치를 푸시하고 `develop` 대상 PR을 엽니다.
8. **병합·정리·보고**: CI가 통과하면 오케스트레이터가 PR을 `develop`에 병합하고(`gh pr merge --squash --delete-branch`), worktree와 로컬 브랜치를 지우고(`git worktree remove`, `git branch -d`), 상태를 `done`으로 바꾼 뒤 사용자에게 무엇이 달라졌고 어떻게 실행해 볼 수 있는지 보고합니다. 사용자는 실행되는 결과물을 보고 피드백하고, 피드백은 새 task가 됩니다. `release`와 `main`으로 올리는 것은 사용자가 승인할 때 합니다.

진행 중에 범위나 완료 기준을 바꿔야 하면 구현자는 멈추고 보고하며, 오케스트레이터가 task를 고쳐 다시 검수를 받습니다.

결정 task(M1)는 5~6단계가 조사·문서 작성과 문서 검토로 바뀔 뿐 흐름은 같습니다.

## task 파일

- 위치: `docs/tasks/T-xxx-slug.md`. 목록은 `docs/tasks/README.md`.
- 구현자는 task 파일과 `AGENTS.md`만 읽고도 작업할 수 있어야 합니다. 대화에서 정한 내용은 task 파일에 옮겨 적습니다.
- 완료 기준은 명령이나 관찰로 확인할 수 있게 씁니다.
- 한 task는 한 번의 위임으로 끝날 크기로 유지합니다. 커지면 나눕니다.
- 상태: `draft` → `proposed`(검수 대기) → `ready`(승인) → `in-progress` → `review` → `done`, 막히면 `blocked`와 사유.
- 검수는 한 번에 여러 task를 묶어 받을 수 있습니다. 다만 각 task의 범위와 완료 기준을 사용자가 실제로 볼 수 있게 보여 줍니다.

## Herdr 위임 절차

먼저 Herdr 안인지 확인합니다.

```sh
test "${HERDR_ENV:-}" = 1
```

task마다 worktree를 만들고, 그 경로에서 구현자 pane을 열어 Claude Code를 시작합니다. pane ID는 응답 JSON의 `.result.pane.pane_id`에서 읽습니다.

```sh
wt=$(scripts/task-worktree.sh T-xxx-slug | tail -1)
herdr pane split --current --direction right --cwd "$wt" --no-focus
herdr agent start impl --kind claude --pane <pane-id>
herdr agent prompt impl "<구현자 프롬프트>" --wait
herdr agent read impl
```

리뷰어도 같은 방식으로 이름 `reviewer`로 시작합니다(`--kind codex`, Codex를 쓸 수 없으면 `--kind claude`). 이미 떠 있는 에이전트는 `herdr agent list`로 확인해 재사용합니다.

- 구현자는 `-- --permission-mode acceptEdits`로 시작합니다. `pnpm`, `cargo`, 로컬 `git`, 는 `.claude/settings.json`의 허용 목록에 있습니다. `main`·`release`·`develop` 직접 푸시와 강제 푸시는 차단되어 있습니다. 그 밖의 명령은 승인 대기로 멈춥니다.
- `blocked`는 에이전트가 승인이나 질문을 기다린다는 뜻입니다. 화면을 읽고, 사용자 결정이 필요한 내용이면 사용자에게 묻습니다.
- `idle`·`done`은 완료의 증거가 아닙니다. 보고 내용과 저장소 상태로 확인합니다.
- 구현자는 항상 자기 worktree에서 일합니다. 서로 다른 기능 폴더만 건드리는 task는 동시에 여러 구현자에게 맡길 수 있습니다.
- worktree는 원래 체크아웃 옆의 `tokyonight-worktrees/` 아래에 생깁니다. 스크립트가 로컬에만 있는 디자인 스킬을 심볼릭 링크로 연결합니다. worktree마다 Rust 빌드 결과가 따로 쌓이므로 첫 빌드는 오래 걸립니다.

### 구현자 프롬프트

```
역할: 구현자. AGENTS.md를 읽고 따르세요.
task: docs/tasks/T-xxx-slug.md
지금 있는 worktree(브랜치 task/T-xxx-slug)에서 범위 안의 작업만 하세요.
끝나면 검증 명령과 빌드를 실행하세요. 모두 통과하면 task 파일의 '작업 기록'을 채우고
커밋하세요. 푸시와 PR은 하지 마세요. 마지막에 AGENTS.md의 완료 보고 형식으로 보고하세요.
결정이 필요한 것을 만나면 추측하지 말고 멈춰서 물으세요.
```

### 리뷰어 프롬프트

```
역할: 리뷰어. AGENTS.md를 읽고 따르세요. 코드를 수정하지 마세요.
task: docs/tasks/T-xxx-slug.md
대상: PR #N (origin/develop...task/T-xxx-slug 의 diff)
완료 기준을 하나씩 대조하고 검증 명령을 직접 실행하세요.
보고: 완료 기준별 충족 여부, 실제 문제(재현 방법 포함), 범위를 벗어난 변경.
취향 차원의 지적은 빼세요.
```

## 디자인 스킬

AI가 만든 티가 나는 UI를 피하기 위해 외부 스킬 두 개를 프로젝트에 설치했습니다. 용량이 커서 저장소에는 넣지 않았고(`.gitignore`), 아래 커밋에서 받아 복사했습니다.

| 스킬 | 출처 | 커밋 | 라이선스 | 설치 위치 |
| --- | --- | --- | --- | --- |
| `impeccable` | github.com/pbakaus/impeccable (`.claude/skills/impeccable`, `.claude/agents/impeccable-*.md`) | `b4bff16` | Apache 2.0 | `.claude/skills/impeccable/`, `.claude/agents/` |
| `hallmark` | github.com/Nutlope/hallmark (`skills/hallmark`) | `04977e1` | MIT | `.claude/skills/hallmark/` |

- 파일만 복사했고 두 저장소의 설치 스크립트는 실행하지 않았습니다. 훅도 등록하지 않았습니다(`impeccable`은 편집할 때마다 검사하는 훅을, `hallmark`는 `install-hook.mjs`를 제공하지만 쓰지 않음).
- `impeccable`은 처음 사용할 때 실행 스크립트가 GitHub 릴리스에서 검사용 바이너리를 내려받아 실행합니다.
- `hallmark`의 이미지 생성 스크립트는 Together AI API 키가 있을 때만 동작합니다. 키를 설정하지 않았습니다.
- `hallmark`는 새 페이지·웹사이트용이고, 기존 화면을 다듬는 일은 `impeccable`이 맞습니다. 이 앱의 작업 화면에는 주로 `impeccable`을 씁니다.

## 사용자 승인이 필요한 것

- task 검수(시작 전), `develop → release`, `release → main` 병합, 릴리스. task 브랜치의 푸시·PR·`develop` 병합은 검증이 통과하면 승인 없이 진행합니다(2026-11-12 사용자 지시).
- 도구 설치와 전역 설정 변경(`rustup`, `herdr integration install` 등).
- README의 제품 범위와 '아직 정하지 않은 것'에 대한 결정.
- 파일 삭제를 동반하는 정리 작업.

## 개발 환경

- Rust: rustup stable (2026-11-12 설치, `cargo`·`rustc` 1.99.1). 새 셸이 아니면 `. "$HOME/.cargo/env"`가 필요합니다.
- Xcode Command Line Tools, `node`, `pnpm`, `claude`, `codex`, `herdr` 0.9.5 있음. `gh` 2.102.0(2026-11-12 설치, 로그인은 사용자가 `gh auth login`으로 직접).
- Herdr 연동: `claude`, `codex` 설치됨(2026-11-12). 연동 설치 전에 시작한 에이전트 세션에는 적용되지 않을 수 있습니다.
- 이 프로젝트의 Herdr 워크스페이스는 `tokyonight`입니다.
- Node·pnpm 버전 고정은 `package.json`이 생기는 T-003에서 합니다.
