# T-003 Tauri 2 + React + TypeScript 스캐폴딩

- 마일스톤: M0 하네스·개발 환경
- 상태: ready
- 의존: T-001
- 담당: 구현자

## 목표

빈 창이 뜨는 최소 앱과 디렉터리 구조를 만든다.

## 범위

- pnpm + Vite + React + TypeScript(strict) 프런트엔드, `src-tauri/` Rust 백엔드.
- Tauri 권한(capabilities)은 최소로 시작한다.
- `pnpm tauri dev`로 창이 열리고 프런트→Rust 명령 호출 예시 1개가 동작한다.
- `AGENTS.md`의 '코드 구조' 절에 실제 디렉터리 구조를 기록한다.

## 범위 밖

- 실제 기능 UI, 편집기 라이브러리 도입.

## 완료 기준

- `pnpm install && pnpm tauri dev`로 macOS에서 창이 열린다.
- `pnpm tauri build`가 성공한다.

## 작업 기록

- (진행하면서 결정·검증 결과·남은 문제를 여기에 적는다)
