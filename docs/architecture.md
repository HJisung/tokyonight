# 설계 메모 (v0.1)

제품 요구사항은 `README.md`가 기준이다. 이 문서는 README에서 "아직 정하지 않은 것"으로 남아 있던 항목 중 첫 구현을 위해 정한 것과, 모듈 사이의 약속을 적는다. 바꿀 수 있는 잠정 결정이다.

## 결정

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 데스크톱 프레임워크 | Tauri 2 (Rust 백엔드 + 시스템 웹뷰) | "빠르고 가벼운" 목표. Windows·macOS 모두 지원 |
| 화면 | React 19 + zustand + TypeScript + Vite | |
| 편집기 | CodeMirror 6 | 아래 "무손실" 참고 |
| Markdown 보존 | 문서는 언제나 Markdown **원문 문자열**이다. 서식 보기는 원문 위에 장식(decoration)을 얹어 기호를 숨기고 꾸미는 방식이며 변환·재직렬화를 하지 않는다 | 지원하지 않는 문법도 글자 그대로 남으므로 모드 전환이나 저장으로 내용을 잃지 않는다. 표만 예외로, 사용자가 표 위젯에서 셀을 고치면 그 표 하나를 다시 직렬화한다 |
| 작업 화면·임시 메모 저장 위치 | OS 앱 데이터 폴더(`state.json`, `sessions/<해시>.json`, `scratch/`). 사용자의 폴더에는 설정 파일을 만들지 않는다. `TOKYONIGHT_DATA_DIR` 환경변수로 위치를 바꿀 수 있다(테스트용) | |
| 저장 | 입력 후 약 0.8초 뒤 자동 저장. 임시 파일에 쓰고 이름을 바꾸는 원자적 쓰기. 줄바꿈(LF/CRLF)과 BOM은 읽은 그대로 되돌려 쓴다 | |
| 외부 변경 | 저장할 때 "내가 마지막으로 본 수정 시각"을 함께 보내고, 디스크가 달라졌으면 쓰지 않는다. 내 변경이 없으면 디스크 내용을 조용히 반영하고, 있으면 **충돌** 상태로 두고 사용자가 고른다(디스크 내용 불러오기 / 내 내용으로 덮어쓰기). 자동으로 한쪽을 덮어쓰지 않는다 | |
| 시작 정책 | 마지막에 열려 있던 세션(폴더 또는 폴더 없는 세션)을 다시 연다. "시작 화면으로"를 고른 뒤 종료했으면 시작 화면 | |
| 드래그 앤 드롭 | 복사만. 이름이 겹치면 건너뛰기 / 둘 다 유지 / 덮어쓰기를 묻는다. 이동은 아직 없음 | |
| 지원 파일 | `.md` `.markdown`은 Markdown, `.txt`와 확장자 없는 파일은 일반 텍스트. UTF-8만. 그 밖의 파일은 트리에 흐리게 보이고 열지 않는다. 점(.)으로 시작하는 항목은 숨긴다 | |

## 구조

```
src-tauri/src/      Rust 백엔드 (완성, cargo test 통과)
  files.rs          읽기·쓰기(충돌 검사)·생성·이름 변경·휴지통·복사
  store.rs          앱 상태, 폴더별 세션, 임시 메모
  watch.rs          폴더/파일 변경 감지 → "fs-changed" 이벤트(경로 배열)
  search.rs         파일 이름·내용 검색
  menu.rs           앱 메뉴 → "menu" 이벤트(MenuCommand 문자열)
src/shared/         순수 로직 (완성)
  types.ts          공용 타입
  layout.ts         분할 배치 트리 연산
  text.ts           줄바꿈/BOM, 종류 판별, diffRange, scratchTitle
  table.ts          표 파싱·직렬화·행열 연산
  paths.ts          경로 도구
src/api.ts          백엔드 호출 래퍼 (완성). 화면 코드는 이것만 통해 시스템에 접근
src/editor/         편집기 모듈  ← 작업 A
src/store.ts, docs.ts, actions.ts, components/, App.tsx, main.tsx, styles.css  ← 작업 B
tests/              vitest 단위 테스트
```

## 모듈 약속: `src/editor/index.ts` (A가 만들고 B가 쓴다)

편집기 모듈은 store·api를 import하지 않는다. 필요한 것은 콜백으로 받는다.

```ts
import type { ChangeSet, Text } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { DocKind, EditMode } from '../shared/types'

export interface EditorOptions {
  parent: HTMLElement
  doc: Text | string
  kind: DocKind
  mode: EditMode            // md일 때만 의미가 있다. txt는 항상 일반 텍스트
  /** 사용자가 이 뷰에서 만든 변경(원격 반영 제외)마다 호출 */
  onLocalChange(changes: ChangeSet, view: EditorView): void
  onFocus(): void
  onOpenLink(url: string): void
}

export interface EditorHandle {
  view: EditorView
  setMode(mode: EditMode): void   // 뷰를 다시 만들지 않고 전환 (undo 기록 유지)
  destroy(): void
}

export function createEditor(opts: EditorOptions): EditorHandle
/** 다른 뷰의 변경을 반영. onLocalChange를 부르지 않고 undo 기록에도 넣지 않는다 */
export function applyRemote(view: EditorView, changes: ChangeSet): void
/** 디스크 내용으로 교체. diffRange로 달라진 구간만 바꿔 커서를 유지. applyRemote와 같은 취급 */
export function replaceContent(view: EditorView, content: string): void
/** 1부터 세는 줄로 이동·스크롤. query가 있으면 그 줄에서 찾아 선택 */
export function revealLine(view: EditorView, line: number, query?: string): void
export function insertTable(view: EditorView): void   // shared/table.ts의 EMPTY_TABLE
export function runUndo(view: EditorView): void
export function runRedo(view: EditorView): void
```

같은 문서를 여러 분할 영역에서 열면 B가 뷰마다 `createEditor`를 부르고, 한 뷰의 `onLocalChange`로 받은 `ChangeSet`을 나머지 뷰에 `applyRemote`로 전달한다.

### 서식 보기(live)가 다루는 것

커서(선택)가 닿은 요소는 원문 기호를 그대로 보여주고, 닿지 않은 요소는 기호를 숨긴다.

- 제목(`#`~`######`, setext), 굵게·기울임·취소선, 인라인 코드
- 링크: 글자만 보이고 ⌘/Ctrl+클릭으로 `onOpenLink`
- 인용문, 글머리표·번호 목록, 체크리스트(클릭으로 토글하는 체크박스)
- 코드 블록(울타리·들여쓰기), 가로줄
- 표: 블록 위젯으로 렌더링하고 셀을 직접 편집. 행·열 추가/삭제, "원문" 버튼. 입력 즉시 원문에 반영(한글 조합 중에도 깨지지 않게)
- 각주: `[^id]` 참조는 위첨자 모양, 클릭하면 `[^id]:` 정의로 이동. 정의 줄은 구분되게 표시
- 이미지 등 그 밖의 문법은 원문 그대로 둔다

원문(source) 모드는 고정폭 글꼴 + 문법 강조만. txt는 장식 없는 일반 텍스트.

### 스타일 변수 (B가 `src/styles.css`의 `:root`에 정의, A는 사용만)

`--bg` `--bg-alt`(사이드바·머리글) `--bg-raised`(코드·표 머리) `--fg` `--fg-muted` `--fg-faint` `--border` `--accent` `--accent-fg` `--selection` `--danger` `--warn` `--ok` `--link` `--code` `--font-ui` `--font-mono`. 어두운 테마(Tokyo Night 계열)가 기본이고 `prefers-color-scheme: light`에서 밝은 값으로 바뀐다. 편집기 고유 스타일은 A가 `src/editor/editor.css`에 두고 `index.ts`에서 import한다.

## 작업 B가 구현할 동작

- **시작 화면**: 새 임시 메모 / 폴더 열기 / 파일 열기, 최근 폴더 목록, 보관 중인 임시 메모 목록.
- **세션**: 폴더 세션과 "폴더 없는 세션"(임시 메모·낱개 파일만). 열 때 `api.loadSession`으로 워크스페이스·분할 배치·펼친 폴더를 복원(`isValidLayout`으로 검증, 실패하면 기본값)하고, 바뀔 때마다 디바운스해서 `api.saveSession`. `api.setLast`로 마지막 세션 기록.
- **워크스페이스 탭**(위쪽): 추가, 이름 변경(더블클릭), 삭제(최소 1개), 전환. 탭마다 배치와 열린 문서를 따로 기억. 방문한 탭은 숨긴 채 유지해 커서·스크롤·undo를 보존.
- **분할 영역**: 좌우·상하 분할, 경계 드래그로 크기 조절, 닫기. 영역 머리글에 문서 이름·저장 상태, md는 서식/원문 전환, 임시 메모는 TXT↔MD 전환, 분할·닫기 버튼. 빈 영역은 안내와 동작 버튼.
- **문서**: 문서마다 하나의 세션(현재 내용, 마지막 저장 내용, mtime, eol, bom, 붙은 뷰들). 같은 문서는 한 번만 불러오고 뷰끼리 동기화. 자동 저장, 충돌·사라짐·읽기 오류 상태를 영역 위 띠로 표시하고 선택지를 준다. 충돌·사라짐 상태에서는 자동 저장을 멈춘다. 저장되지 않은 변경을 잃게 되는 닫기는 먼저 묻는다.
- **왼쪽 사이드바**: 파일 트리(지연 로딩, 펼침 상태 기억), 새 Markdown/텍스트 파일·새 폴더, 이름 변경, 휴지통으로 이동, Finder에서 보기, 오른쪽 분할로 열기(우클릭 메뉴). 이름 변경·삭제 전 관련 문서의 대기 중인 저장을 먼저 끝내고, 이름 변경 후 열린 문서의 경로를 따라 옮긴다. 임시 메모 목록(열기·삭제). 검색 탭(파일 이름 + 내용, 결과 클릭 시 해당 줄로 이동).
- **임시 메모**: 만들자마자 앱 데이터에 자동 저장되어 재실행 후에도 남는다. 기본 TXT. ⌘S/Ctrl+S 때 위치·이름을 골라 실제 파일로 바꾸고 임시 메모에서 제거.
- **외부 변경**: `api.onChanged` 이벤트와 창이 다시 포커스될 때 열린 파일과 트리를 확인. 폴더 밖 파일은 `api.watchFiles`로 감시.
- **OS에서 끌어다 놓기**: Tauri `getCurrentWebview().onDragDropEvent`로 받아 놓인 위치의 폴더(파일 위면 그 부모, 빈 곳이면 루트)에 복사. 대상 폴더 강조.
- **메뉴 명령**: `api.onMenu`로 오는 `MenuCommand` 전부 처리. 단축키는 네이티브 메뉴가 담당한다.
- **종료**: 창을 닫기 전에 대기 중인 저장을 모두 끝낸다(`getCurrentWindow().onCloseRequested`).
- **창 머리**: macOS는 신호등 버튼 자리(왼쪽 약 78px)를 비우고 `data-tauri-drag-region`으로 끌 수 있게 한다. Windows는 기본 창틀.

## 검증

- `npm run typecheck`, `npm test`(vitest), `npm run test:rust`
- 실행: `npm run dev` (PATH에 `/opt/homebrew/opt/rustup/bin` 필요)

## 아직 하지 않은 것

드래그로 이동, 이미지 표시, 복잡한 표(병합 등), 댓글, 패키징·서명·배포, Windows 실기 검증, 성능 측정.
