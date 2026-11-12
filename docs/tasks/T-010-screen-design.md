# T-010 화면 구성, DESIGN.md, 앱 뼈대

- 마일스톤: M1 미정 사항 결정 (MVP)
- 상태: ready
- 검수: 승인 (2026-11-12)
- 의존: T-004
- 담당: 구현자(`impeccable` 스킬 사용)

## 목표

MVP 화면의 배치와 디자인 기준을 정하고, 기능이 들어갈 빈 앱 뼈대를 만든다.

## 범위

- `impeccable` 스킬로 `PRODUCT.md`(README 기반)와 `DESIGN.md`(색, 글꼴, 간격, 모서리, 라이트·다크)를 작성하고 `src/styles/theme.css`의 토큰에 반영한다.
- 추측: 라이트·다크를 모두 지원하고 기본은 시스템 설정을 따른다. 저장소 이름과 달리 Tokyo Night 색 테마를 그대로 쓰지는 않는다(제품명 미정).
- 앱 뼈대 `src/features/shell/`: 왼쪽 사이드바(접기·너비 조절), 위쪽 워크스페이스 탭 줄, 본문 영역. 각 영역은 빈 자리만 둔다.
- `docs/design/screens.md`: 화면별 와이어프레임(시작 화면, 폴더 연 상태, 분할 상태, 빈 상태)과 단축키 표(macOS/Windows).
- 아이콘은 lucide-react.

## 범위 밖

- 실제 기능(파일 목록, 편집기, 분할, 탭 동작).
- 앱 아이콘, 제품명.

## 완료 기준

- `DESIGN.md`, `PRODUCT.md`, `docs/design/screens.md`가 있다.
- 앱을 실행하면 세 영역의 뼈대가 보이고 사이드바 접기와 라이트·다크 전환이 동작한다.
- 컴포넌트에 임의 색·간격 값이 없다(토큰만 사용).
- PR에 라이트·다크 스크린샷이 첨부되어 있고 `pnpm check`가 통과한다.
- 사용자가 스크린샷을 보고 방향을 확인했다(병합 전).

## 작업 기록

### 2026-11-12 구현자

진행 중 사용자 지시가 바뀌었습니다: 중간 확인 없이 진행하고 MVP 완성 뒤에 한꺼번에 검토합니다. 그래서 완료 기준의 '사용자가 스크린샷을 보고 방향을 확인했다'는 MVP 완성 뒤로 미뤘고, 화면 캡처를 할 수 없어 스크린샷도 없습니다.

#### 가정 (사용자 확인 없이 정한 것. 나중에 바꿀 수 있음)

| 항목 | 정한 내용 | 근거 | 바꾸려면 |
| --- | --- | --- | --- |
| 주 사용자 | 공부하거나 자료를 정리하는 개인 | README의 유일한 예시가 `공부` 폴더 | `PRODUCT.md`의 Users |
| 시각 방향 | "잉크와 종이": 종이 면과 가라앉은 껍데기 면, 강조색은 블루블랙 잉크 하나, 현재 위치는 잉크색 2px 선 | 새 제품 개념을 만들지 않고, 강조가 '어느 탭·어느 영역이 활성인가' 표시에 그대로 쓰임. 다른 후보: 견출지(워크스페이스별 색), 모눈 공책, 카테고리 표준 | `src/styles/theme.css`의 색 값과 `DESIGN.md` |
| UI 글꼴 | Geist + OS 한글 글꼴(추가 설치 없음) | 새 의존성 없음. 한글 모양이 OS마다 다름 | `theme.css`의 `--font-sans`. Pretendard 추가는 승인 필요 |
| 배치 | 위쪽 줄이 창 너비 전체, 그 아래 사이드바와 본문 | 사이드바를 접어도 접기 버튼이 같은 자리에 남음 | `src/features/shell/AppShell.tsx` |
| 사이드바 너비 | 기본 264px, 200~480px | 일반적인 파일 목록 너비 | `src/features/shell/sidebarWidth.ts` |
| 테마 전환 | 버튼 하나로 시스템 → 라이트 → 다크 순환 | 기본이 시스템 설정이어야 함(task의 추측 항목) | `src/features/shell/theme.ts` |
| 사이드바 단축키 | `⌘\` / `Ctrl+\` | `⌘B`는 Markdown 굵게와 겹침 | `src/features/shell/sidebarShortcut.ts` |
| 그 밖의 단축키 | `docs/design/screens.md`의 표(제안) | 각 기능 task에서 확정 | `docs/design/screens.md` |
| 모서리 | 기준 반지름 0.375rem(shadcn 기본 0.625rem에서 줄임) | 촘촘한 도구 화면에 맞춤 | `theme.css`의 `--radius` |

#### 결정

- 사이드바 너비, 접힘 상태, 고른 테마는 저장하지 않습니다(앱을 닫으면 사라짐). 저장 위치가 README '아직 정하지 않은 것'에 해당합니다.
- 접은 사이드바는 내리지 않고 `hidden`으로 숨깁니다. 다시 펴도 안쪽 상태가 남습니다.
- 사이드바 너비(px)는 사용자가 바꾸는 값이라 토큰이 아니라 `sidebarWidth.ts`에 두었고, `Sidebar`의 인라인 `style={{ width }}`로 들어갑니다. 컴포넌트에서 토큰이 아닌 수치는 이것 하나입니다.
- `src/components/ui/button.tsx`(shadcn 기본)에 있던 임의 값 네 종류를 토큰으로 바꿨습니다: `rounded-[min(var(--radius-md),10px|12px)]` → `rounded-md`, `text-[0.8rem]` → `text-xs`, `hover:bg-[color-mix(...)]` → `hover:bg-secondary/80`.
- 쓰지 않는 `chart-1`~`chart-5` 토큰을 지웠고 `selection`, `font-mono` 토큰을 추가했습니다.

#### impeccable 스킬 사용

- 실행 스크립트(`scripts/impeccable`)는 외부 바이너리를 내려받으므로 실행하지 않았습니다. `reference/`의 `init.md`, `new-work.md`, `mode-operate.md`, `operate.md`, `craft-floor.md`, `document.md`를 직접 읽고 따랐습니다.
- 스크립트가 있어야 하는 단계는 하지 못했습니다: 방향 추첨(`concept-seed`), 화면별 브리프(`surface-brief`), 디자인 검사기(`detect`), 화면 캡처를 받는 마무리 검토(finish reviewer). 방향 후보는 직접 뽑았고, `DESIGN.md`와 `.impeccable/design.json`은 구현을 마친 뒤 코드에서 직접 옮겨 적었습니다.

#### 검증

- `pnpm check`: 통과. typecheck, lint, format:check 통과, Vitest 7개 파일 28개 테스트 통과, Rust fmt·clippy·test 통과(테스트 1개).
- `pnpm tauri build`: 통과. `tokyonight.app`, `tokyonight_0.1.0_aarch64.dmg` 생성.
- 화면은 직접 보지 못했습니다. 색 대비는 계산으로만 확인했고, 실제 모습은 `pnpm tauri dev`로 확인해야 합니다.

#### 완료 기준

- `DESIGN.md`, `PRODUCT.md`, `docs/design/screens.md`가 있다: 충족.
- 세 영역의 뼈대, 사이드바 접기, 라이트·다크 전환: 테스트로 확인(`AppShell.test.tsx`). 실제 화면은 미확인.
- 컴포넌트에 임의 색·간격 값이 없다: 충족(위 사이드바 너비 인라인 스타일 제외).
- PR에 라이트·다크 스크린샷: 미충족(캡처 불가).
- 사용자가 방향을 확인했다: MVP 완성 뒤로 미룸.

#### 남은 문제

- `src/features/.gitkeep`이 남아 있습니다. `git rm`이 허용되지 않아 지우지 못했습니다. 지워도 됩니다.
- `AGENTS.md`의 '코드 구조' 절에 `src/features/shell/`, `PRODUCT.md`, `DESIGN.md`, `docs/design/screens.md`, `.impeccable/design.json`을 추가해야 합니다(다른 구현자와의 충돌을 피하려고 고치지 않음). `theme.css` 설명의 "값은 shadcn 기본값, T-010에서 확정"도 고쳐야 합니다.
- `index.html`의 `<html lang="ko">`와 창 제목은 그대로 두었습니다.
- `⌘D`/`Ctrl+D`(분할 제안)는 CodeMirror 기본 동작과 겹칩니다. T-040에서 정해야 합니다.
- 경고·성공·정보 색, 그림자 토큰은 쓰는 곳이 없어 정하지 않았습니다.
