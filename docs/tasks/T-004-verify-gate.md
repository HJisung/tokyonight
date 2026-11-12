# T-004 검증 게이트 `pnpm check` 구성

- 마일스톤: M0 하네스·개발 환경
- 상태: proposed
- 검수: 대기
- 의존: T-003
- 담당: 구현자

## 목표

구현자와 리뷰어가 같은 한 줄 명령으로 변경을 검증할 수 있게 한다.

## 범위

- `pnpm check` = 타입 검사(tsc) + ESLint + Prettier 확인 + Vitest + `cargo fmt --check` + `cargo clippy -D warnings` + `cargo test`.
- 프런트 단위 테스트 1개, Rust 단위 테스트 1개를 예시로 넣는다.
- `AGENTS.md`의 '검증' 절에 있는 명령을 실제 값으로 채운다.

## 범위 밖

- E2E 테스트(T-063).

## 완료 기준

- 깨끗한 체크아웃에서 `pnpm check`가 성공한다.
- 일부러 타입 오류·clippy 경고를 넣으면 실패한다.

## 작업 기록

- (진행하면서 결정·검증 결과·남은 문제를 여기에 적는다)
