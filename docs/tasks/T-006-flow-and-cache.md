# T-006 브랜치 단순화와 빌드 캐시 공유

- 마일스톤: M0 하네스·개발 환경
- 상태: in-progress
- 검수: 승인 (2026-11-12)
- 의존: T-004
- 담당: 오케스트레이터

## 목표

혼자 MVP를 만드는 단계에 맞게 브랜치 단계를 줄이고, task를 시작할 때마다 Rust 의존성을 다시 컴파일하는 시간을 없앤다.

## 범위

- 브랜치 흐름을 `task → develop → main`으로 줄인다. `AGENTS.md`, `docs/harness.md`, 권한 설정에서 `release` 단계를 뺀다.
- `develop → main`은 배포할 때 사용자 승인 후에 한다.
- T-005(CI/CD) 명세에서 `release` 브랜치를 뺀다.
- `scripts/task-worktree.sh`가 worktree에 `.cargo/config.toml`을 만들어 Rust 빌드 결과를 원래 체크아웃의 `src-tauri/target`으로 모은다.

## 범위 밖

- 원격 저장소의 기본 브랜치 변경.
- 브랜치 보호 규칙(T-005).

## 완료 기준

- 규칙 문서에 `release` 브랜치 단계가 남아 있지 않다.
- 새 worktree의 첫 `pnpm tauri build`가 전체 재컴파일 없이 끝난다(시간 기록).
- 두 worktree에서 동시에 빌드해도 둘 다 성공한다.

## 작업 기록

