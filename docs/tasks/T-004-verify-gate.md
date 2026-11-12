# T-004 검증 게이트 `pnpm check` 구성

- 마일스톤: M0 하네스·개발 환경
- 상태: ready
- 검수: 승인 (2026-11-12)
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

### 2026-11-12 구현자

**결과**

- 깨끗한 체크아웃에서 `pnpm check` 성공: 충족. `dist/`와 `src-tauri/target/`이 없는 새 worktree에서 `pnpm install` 뒤 바로 통과했다.
- 일부러 타입 오류·clippy 경고를 넣으면 실패: 충족. 확인 뒤 둘 다 되돌렸다.

**구성**

- `pnpm check` = `pnpm typecheck`(tsc) → `pnpm lint`(ESLint) → `pnpm format:check`(Prettier) → `pnpm test`(Vitest) → `pnpm check:rust`(`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`). `&&`로 이어 첫 실패에서 멈춘다.
- 예시 테스트: `src/app/useAppInfo.test.ts`(3개, `@/ipc`를 `vi.mock`으로 대체), `src-tauri/src/app_info.rs`의 `tests` 모듈(1개).
- 추가한 개발 의존성: `eslint`, `@eslint/js`, `typescript-eslint`, `prettier`, `vitest`, `@testing-library/react`, `jsdom`. `@eslint/js`·`typescript-eslint`는 ESLint가 TypeScript를 읽는 데, `jsdom`은 Testing Library가 DOM을 쓰는 데 필요해서 넣었다. `docs/decisions/0006-libraries.md` 표에는 이름이 없다.
- ESLint 규칙은 `@eslint/js`와 `typescript-eslint`의 권장 규칙만 켰다. Prettier는 기본 설정이다(설정 파일 없음).
- Prettier는 Markdown을 검사하지 않는다(`.prettierignore`). 검사하면 기존 문서 전체의 줄바꿈·표가 바뀌어 다른 task와 충돌한다.
- Vitest 전역은 켜지 않았다. 테스트에서 `vitest`를 직접 import하고, `vitest.setup.ts`가 Testing Library `cleanup`을 등록한다.

**검증**

- `pnpm check` → 성공. Vitest 1개 파일 3개 통과, cargo test 1개 통과, clippy·fmt 경고 없음.
- `src/ipc/index.ts`에 `export const deliberateTypeError: number = "not a number";`를 넣고 `pnpm check` → `error TS2322`, 종료 코드 2로 실패. 되돌림.
- `src-tauri/src/app_info.rs`의 `get_app_info`를 `let info = …; return info;`로 바꾸고 `pnpm check` → `error: unneeded return statement`(`clippy::needless_return`), 종료 코드 101로 실패. 되돌림.
- 되돌린 뒤 `pnpm check` → 성공.
- `pnpm tauri build` → 성공. `tokyonight.app`, `tokyonight_0.1.0_aarch64.dmg` 생성.

**공용 영역 변경**

- `package.json`(스크립트·개발 의존성), `pnpm-lock.yaml`, `vite.config.ts`(`test` 설정, `defineConfig`를 `vitest/config`에서 가져옴), `tsconfig.node.json`(`vitest.setup.ts` 포함), `AGENTS.md`('검증'·'코드 구조' 절).
- Prettier 형식만 맞춘 기존 파일(동작 변화 없음): `src/app/App.tsx`, `src/components/ui/button.tsx`, `src/lib/utils.ts`, `src/styles/theme.css`.

**남은 문제**

- `docs/decisions/0006-libraries.md` 표에 ESLint, Prettier, `typescript-eslint`, `jsdom`을 올릴지는 사용자 결정이 필요하다. 이 task에서는 표를 고치지 않았다.
- `eslint-plugin-react-hooks` 같은 React 전용 린트 규칙은 넣지 않았다. 넣으려면 라이브러리 승인이 필요하다.
- `pnpm typecheck`는 `src/`만 검사한다. `vite.config.ts`와 `vitest.setup.ts`(`tsconfig.node.json`)는 `tsc -b`를 써야 검사되는데, T-003의 구성을 그대로 뒀다.
- Windows에서는 실행해 보지 않았다. T-005의 CI에서 확인된다.
