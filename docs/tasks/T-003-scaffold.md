# T-003 Tauri 2 + React + TypeScript 스캐폴딩

- 마일스톤: M0 하네스·개발 환경
- 상태: ready
- 검수: 승인 (2026-11-12, 스타일은 Tailwind + shadcn/ui로 변경)
- 의존: T-001
- 담당: 구현자

## 목표

빈 창이 뜨는 최소 앱과 디렉터리 구조를 만든다.

## 범위

- pnpm + Vite + React + TypeScript(strict) 프런트엔드, `src-tauri/` Rust 백엔드. `create-tauri-app`의 예제 화면과 예제 코드는 지운다.
- Node·pnpm 버전을 고정한다(`package.json`의 `engines`, `packageManager`). 현재 Node 24.18.0, pnpm 11.10.0.
- `AGENTS.md`의 구조 규칙대로 빈 뼈대를 만든다: `src/app/`(진입점), `src/features/`, `src/components/ui/`, `src/lib/`, `src/ipc/`, `src/styles/`. 스타일은 Tailwind CSS v4(`@tailwindcss/vite`)를 쓰고, 디자인 토큰은 `src/styles/theme.css`의 `@theme`에 정의한다. UI 컴포넌트는 shadcn/ui를 쓴다: `shadcn init`으로 설정하고(`components.json`, 컴포넌트 경로는 `src/components/ui`, 경로 별칭 `@/`), 동작 확인용으로 `button` 하나만 추가한다. 토큰 값은 shadcn 기본값으로 두며 T-010에서 정한다.
- `src/ipc/`에 Rust 명령을 부르는 타입 있는 래퍼 예시 1개(앱 버전 조회)와 대응하는 Rust 명령 1개. 화면에는 앱 이름과 버전만 표시한다.
- Tauri 권한(capabilities)은 최소로 시작한다. 앱 식별자와 창 제목은 임시값 `tokyonight`.
- `AGENTS.md`의 '코드 구조' 절에 실제 디렉터리 구조를 기록한다.

## 범위 밖

- 실제 기능 UI, 디자인(T-010), 편집기 라이브러리 도입(T-024), 린트·테스트 설정(T-004).
- 상태 관리 라이브러리 선택(T-021에서 결정).

## 완료 기준

- `pnpm install && pnpm tauri dev`로 macOS에서 창이 열린다.
- `pnpm tauri build`가 성공한다.
- 창에 Rust에서 받아 온 버전이 표시된다.
- `pnpm exec tsc --noEmit`이 통과한다.
- 통과하면 커밋·푸시하고 `develop` 대상 PR이 열려 있다.

## 작업 기록

- (진행하면서 결정·검증 결과·남은 문제를 여기에 적는다)
