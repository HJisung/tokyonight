# T-002 Herdr 위임 경로 구축·스모크 테스트

- 마일스톤: M0 하네스·개발 환경
- 상태: in-progress
- 의존: 없음
- 담당: 사용자+오케스트레이터

## 목표

오케스트레이터가 Herdr pane의 Claude 구현자와 Codex 리뷰어에게 작업을 보내고 결과를 읽어 올 수 있음을 실제로 확인한다.

## 범위

- `herdr integration install claude`·`codex` 적용 여부를 사용자에게 확인한다(전역 설정 `~/.claude`, `~/.codex`에 훅을 추가하므로 승인 필요). 현재 둘 다 미설치.
- `docs/harness.md`의 위임 절차대로 pane 분할 → 에이전트 시작 → 프롬프트 → 결과 읽기를 한 번씩 수행한다.
- 반복되는 절차는 `scripts/delegate.sh` 또는 프로젝트 skill(`.claude/skills/delegate`)로 묶는다.
- 실제 동작과 문서가 다르면 `docs/harness.md`를 고친다.

## 범위 밖

- 병렬 worktree 운영 자동화.

## 완료 기준

- 구현자(Claude)와 리뷰어(Codex) pane 각각에 연습용 task를 보내고 보고를 받아 왔다.
- `blocked` 상태(승인 대기)를 만났을 때의 처리 방법이 문서에 있다.
- 위임 프롬프트 템플릿이 실제 사용한 형태로 갱신되었다.

## 작업 기록

- 2026-11-12: 사용자 승인 후 `herdr integration install claude`, `codex` 적용(`integration status`에서 둘 다 current).
- 남은 것: 구현자·리뷰어 pane 위임 스모크 테스트, 위임 스크립트 또는 skill.
