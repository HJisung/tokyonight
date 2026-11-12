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

### 2026-11-12 구현자

**결과 (완료 기준별)**

- `pnpm install && pnpm tauri dev`로 창이 열린다: 부분 확인. `pnpm tauri dev`가 오류 없이 빌드되어 `target/debug/tokyonight`가 실행됐다. 창의 실제 모습은 화면 캡처를 하지 않기로 해서 구현자가 보지 못했고, 사용자가 직접 확인한다.
- `pnpm tauri build` 성공: 충족. `tokyonight.app`, `tokyonight_0.1.0_aarch64.dmg` 생성.
- 창에 Rust에서 받아 온 버전이 표시된다: 부분 확인. dev 실행 중 `get_app_info`에 임시 로그를 넣어 프런트엔드가 명령을 호출하는 것까지 확인했다(임시 로그는 삭제). 화면에 그려진 결과와, 릴리스 바이너리를 실행한 확인은 하지 않았다(사용자 지시로 생략).
- `pnpm exec tsc --noEmit` 통과: 충족.
- 커밋·푸시·PR: 커밋만 했다. 진행 중 규칙이 바뀌어 푸시와 PR은 구현자가 하지 않는다.

**검증**

- `pnpm exec tsc --noEmit` → 출력 없이 종료(통과).
- `pnpm tauri build` → `Finished 2 bundles` (macos/tokyonight.app 4.03 MiB, dmg 2.11 MiB).
- `pnpm tauri dev` → `Finished dev profile`, `Running target/debug/tokyonight`, 오류 로그 없음. CSP 적용 후 재빌드에서도 `get_app_info` 호출 로그 2회(StrictMode의 effect 2회 실행) 확인 뒤 종료.

**결정**

- `create-tauri-app`(react-ts 템플릿)을 임시 폴더에 만들어 참고만 하고, 파일은 직접 작성했다. 예제 화면·예제 코드·`tauri-plugin-opener`는 넣지 않았다. 임시 폴더는 삭제했다.
- shadcn은 `shadcn init --base base --preset nova`(현재 CLI 기본값, style `base-nova`, baseColor neutral)로 설정했다. 그 결과 기본 UI 프리미티브가 Radix가 아니라 Base UI(`@base-ui/react`)이고, 클래스 병합은 `clsx + tailwind-merge` 대신 shadcn의 `cn` 패키지를 쓴다. `shadcn`, `tw-animate-css`, `lucide-react`, `class-variance-authority`, `@fontsource-variable/geist`도 init이 추가했다.
- `shadcn init`이 한 파일에 쓴 토큰을 `src/styles/theme.css`로 옮기고 `src/styles/index.css`는 import와 기본 레이어만 남겼다. `components.json`의 `tailwind.css`는 `theme.css`를 가리킨다.
- 앱 식별자는 task대로 `tokyonight` 한 단어다. 빌드는 통과한다.
- capabilities는 `permissions: []`로 시작한다. 앱 자체 명령(`get_app_info`) 호출에는 권한이 필요 없다.
- CSP: 처음에 템플릿 기본값인 `null`로 두었으나 필요한 이유가 없어 제한적인 값으로 바꿨다(`default-src 'self'`, `connect-src ipc: http://ipc.localhost`, `img-src 'self' data:`, `font-src 'self'`, `style-src 'self'`).
- 아이콘은 템플릿의 Tauri 기본 아이콘으로 `pnpm tauri icon`을 돌려 만든 임시값이다. iOS·Android 아이콘은 지웠다.
- TypeScript는 템플릿과 같은 `~6.0.3`으로 두었다(7.0.2가 나와 있음).
- `.gitignore`: `node_modules/`, `dist/` 등을 추가했고, `.claude/skills/impeccable`·`hallmark` 패턴의 끝 슬래시를 지워 심볼릭 링크도 무시되게 했다.

**남은 문제**

- 창 모습과 버전 표시는 사용자가 `pnpm tauri dev`로 직접 확인해야 한다. 릴리스 빌드에서 CSP 아래 동작하는지도 실행해 본 적이 없다.
- CSP의 `style-src 'self'`는 인라인 스타일을 막는다. 인라인 스타일을 쓰는 라이브러리(CodeMirror 등, T-024)를 넣을 때 조정이 필요할 수 있다.
- shadcn 기본 `button.tsx`에는 임의 값 클래스(`rounded-[min(...)]`, `text-[0.8rem]`)가 있고 파일 이름이 소문자다. AGENTS.md 규칙과 어긋나지만 기본값 유지가 task 범위라 그대로 두었다. T-010에서 맞춰야 한다.
- Base UI와 Radix 중 무엇을 쓸지, Geist 글꼴을 유지할지는 CLI 기본값을 따른 것이라 사용자 확인이 필요하다.
- `components.json`의 `hooks` 별칭(`@/hooks`)에 해당하는 폴더는 구조 규칙에 없어 만들지 않았다.
- 식별자 `tokyonight`는 역도메인 형식이 아니다. 배포 전에 정해야 한다.
- 훅 `useAppInfo`의 테스트는 테스트 설정(T-004)이 없어 쓰지 않았다.
