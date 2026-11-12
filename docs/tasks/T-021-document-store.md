# T-021 문서 저장소: 단일 버퍼와 다중 뷰

- 마일스톤: M2 파일·문서 코어 (MVP)
- 상태: done
- 검수: 승인 (2026-11-12)
- 의존: T-020
- 담당: 구현자

## 목표

한 문서를 여러 영역에서 열어도 내용이 하나로 유지되는 프런트 문서 모델을 만든다.

## 범위

- `src/features/documents/`에 Zustand store. 문서 ID(파일 경로 또는 임시 메모 ID), 종류(Markdown/일반 텍스트), 현재 내용, 디스크 기준 내용, 수정됨 여부.
- 동작: 열기(이미 열려 있으면 같은 문서를 돌려줌), 내용 변경, 저장, 다른 이름으로 저장, 닫기(보고 있는 뷰가 없을 때 정리), 경로 변경 반영.
- 편집기 라이브러리에 의존하지 않는 인터페이스(내용 읽기, 변경 적용, 변경 구독)만 내보낸다. 편집기를 Tiptap으로 바꿔도 이 기능은 그대로 쓸 수 있어야 한다.
- 저장 실패 시 수정됨 상태를 유지하고 오류를 돌려준다.

## 범위 밖

- 편집기 화면(T-024), 분할 UI(T-040), 자동 저장(T-050).

## 완료 기준

- 단위 테스트: 같은 문서를 두 번 열면 한 버퍼를 공유, 한쪽 변경이 다른 구독자에게 전달, 저장 후 수정됨 해제, 저장 실패 시 수정됨 유지.
- `pnpm check`가 통과한다.

## 작업 기록

### 2026-11-12 구현 (구현자)

**결과 (완료 기준별)**

- 단위 테스트 — 충족. `src/features/documents/documentStore.test.ts`에 네 가지가 모두 있다.
  - 같은 문서를 두 번 열면 한 버퍼 공유: "같은 문서를 두 번 열면 다시 읽지 않고 한 버퍼를 공유한다", "동시에 열어도 한 번만 읽고 한 버퍼를 공유한다"
  - 한쪽 변경이 다른 구독자에게 전달: "한쪽의 변경이 다른 구독자에게 전달된다"
  - 저장 후 수정됨 해제: "저장하면 현재 내용을 쓰고 수정됨이 해제된다"
  - 저장 실패 시 수정됨 유지: "저장에 실패하면 수정됨을 유지하고 오류를 돌려준다"
- `pnpm check` 통과 — 충족.

**만든 것**

- `src/features/documents/`
  - `documentId.ts`: 문서 ID(`DocumentId`, 문자열). `fileDocumentId(path)`는 `file:<경로>`, 임시 메모는 `scratch:<임시 ID>`로 두 종류를 구분한다. `documentSource`·`documentPath`로 되돌려 읽고, `kindFromPath`로 종류를 정한다.
  - `textChange.ts`: 편집기와 무관한 변경 표현 `TextChange { from, to, insert }`(변경 전 내용 기준 UTF-16 위치)과 적용 함수.
  - `documentStore.ts`: Zustand(vanilla) store와 동작. `open`, `createScratch`, `get`/`getContent`, `applyChanges`/`setContent`, `subscribe`, `subscribeIdChanges`, `setKind`, `save`, `saveAs`, `close`, `applyPathChange`. 앱 공용 인스턴스는 `documents`.
  - `useDocument.ts`: 문서 상태(내용·수정됨)를 React에서 구독하는 훅.
  - `index.ts`: 위에서 다른 기능이 쓸 것만 내보낸다.
- 편집기 쪽(T-024)이 쓰는 인터페이스는 내용 읽기 `documents.getContent(id)`, 변경 적용 `documents.applyChanges(id, changes, origin)`, 변경 구독 `documents.subscribe(id, listener)` 세 가지다. 구독자는 `{ id, content, changes, origin }`을 받으며, 자기가 낸 변경은 `origin`으로 구분해 건너뛴다. CodeMirror·Tiptap 타입은 어디에도 없다.

**결정과 가정** (README·`docs/decisions`에 없는 세부를 직접 정한 것)

- 내용은 받은 그대로 보관·저장한다. 줄바꿈(CRLF/LF)과 맨 앞 BOM을 건드리지 않는다(테스트 "BOM과 CRLF를 바꾸지 않고 받은 그대로 보관하고 쓴다").
- 문서 종류는 Rust `classify_file`과 같은 규칙이다: `.md`(대소문자 무시)만 Markdown, 그 밖의 확장자와 확장자 없는 파일은 일반 텍스트. 파일 문서의 종류는 확장자가 정하고(`setKind`는 `false`), 임시 메모만 `setKind`로 바꿀 수 있다(T-025의 TXT↔MD 전환용).
- 수정됨: 현재 내용이 디스크 기준 내용과 다르면 수정됨. 고쳤다가 원래대로 되돌리면 해제된다. 임시 메모는 디스크 기준이 없으므로(`savedContent: null`) 내용이 있으면 수정됨이다.
- 닫기는 뷰 수를 센다. `open`한 횟수만큼 `close`해야 정리된다. **마지막 뷰를 닫을 때 저장하지 않은 내용이 있으면 닫지 않고 `{ status: "dirty" }`를 돌려준다.** 사용자가 버리기를 고른 뒤 `close(id, { discard: true })`로만 버릴 수 있다. 확인 창은 이 저장소가 아니라 화면 쪽(T-024/T-025) 몫이다.
- 저장 결과는 던지지 않고 `{ ok: true, id } | { ok: false, error }`로 돌려준다. `error`는 `FsError`이거나 저장소 오류(`notOpen`, `noPath`, `alreadyOpen`)다. 경로가 없는 임시 메모에 `save`를 부르면 `noPath`이고, 화면 쪽이 `pickSaveFile`로 경로를 받아 `saveAs`를 부른다. 저장소는 대화상자를 열지 않는다.
- 저장하는 동안 내용이 더 바뀌면 실제로 쓴 내용이 디스크 기준이 되고 수정됨이 남는다. 같은 문서의 저장은 요청 순서대로 하나씩 실행한다.
- `saveAs`는 임시 메모든 파일 문서든 문서를 새 경로의 문서로 바꾼다(ID가 바뀜, 원래 파일은 그대로 남음). 대상 경로가 이미 다른 문서로 열려 있으면 쓰지 않고 `alreadyOpen`을 돌려준다(한 경로에 버퍼 둘이 생겨 서로 덮어쓰는 것을 막음).
- ID가 경로를 담으므로 다른 이름으로 저장·경로 변경 때 ID가 바뀐다. 내용 구독은 자동으로 따라가고, ID를 들고 있는 쪽(분할·탭, T-040/T-041)은 `documents.subscribeIdChanges`로 새 ID를 받아야 한다. 옛 ID를 새 ID로 자동 연결하지 않은 이유는, 옛 경로에 새 파일이 생겼을 때 엉뚱한 문서를 가리키게 되기 때문이다.
- `applyPathChange(from, to)`는 파일뿐 아니라 폴더 이름 변경·이동도 처리한다(그 아래 열린 문서를 모두 옮김, `/`와 `\` 모두 인식). 디스크의 이름 변경 자체는 하지 않으며, 파일 트리(T-023)가 `renameEntry` 성공 후 부른다.

**검증**

- `pnpm check`: 통과. typecheck, lint, format:check 통과, Vitest 12개 파일 90개 테스트 통과(이 task에서 추가한 것은 4개 파일), Rust fmt·clippy 통과, cargo test 42개 통과.
- `pnpm tauri build`: 통과. `tokyonight.app`, `tokyonight_0.1.0_aarch64.dmg` 생성.
- 화면에 연결된 곳이 아직 없어(T-024에서 연결) 앱을 실행해 확인할 것은 없다.

**변경**

- 브랜치 `task/T-021-document-store`.
- 새 폴더 `src/features/documents/`(위 목록).
- 공용 영역: `package.json`, `pnpm-lock.yaml`에 `zustand` 5.1.0 추가(0006에서 승인된 라이브러리). `src/ipc`는 바꾸지 않았다.
- AGENTS.md '코드 구조' 절에 추가할 내용(오케스트레이터가 반영):
  ```
  src/features/documents/  문서 저장소(Zustand). 한 문서를 여러 뷰가 공유하는 버퍼. `documents`(열기·변경·구독·저장·닫기·경로 변경), `useDocument`, 문서 ID(`fileDocumentId`)
  ```
  그리고 "`features/` 아직 비어 있음" 문구는 이제 사실이 아니다.

**남은 문제**

- 같은 파일을 다른 표기로 열면(대소문자만 다른 경로, 심볼릭 링크, `..` 포함) 다른 문서로 취급되어 버퍼가 둘이 된다. 프런트에서는 정규화할 수 없으므로, 필요하면 Rust 쪽이 정규화한 경로를 돌려주는 방식으로 별도 task에서 다뤄야 한다. 지금은 선택 대화상자와 `listDir`이 준 경로를 그대로 쓰면 문제가 드러나지 않는다.
- 저장(쓰기)이 진행 중인 바로 그 순간에 같은 파일의 경로 변경이 반영되면, 진행 중이던 쓰기는 옛 경로로 간다(대기 중이던 저장은 새 경로로 간다). 파일 트리(T-023)에서 이름을 바꾸기 전에 진행 중인 저장을 기다리게 하면 피할 수 있다.
- `applyPathChange`에서 새 경로가 이미 다른 문서로 열려 있으면 옮기지 않고 `conflicts`로 돌려준다. `renameEntry`가 기존 대상을 거부하므로 정상 흐름에서는 생기지 않지만, 생겼을 때 사용자에게 어떻게 보일지는 T-023에서 정해야 한다.
- 디스크의 파일이 밖에서 바뀌었을 때 다시 읽는 동작은 없다(T-052 범위). 그때 `savedContent`를 갱신하는 동작을 이 저장소에 추가해야 한다.
- 임시 메모 ID는 `crypto.randomUUID()`로 만든다. 복구(T-051)가 ID를 정해 되살려야 하면 `createScratch`에 ID를 받는 인자를 추가해야 한다.
- 다른 기능의 테스트는 공용 인스턴스 `documents`를 함께 쓰므로, 테스트가 끝나면 연 문서를 `close(id, { discard: true })`로 닫아야 테스트 사이에 상태가 남지 않는다.

### 2026-11-12 오케스트레이터 검증

- 작업 기록과 저장 경로(`save`, `saveAs`, 저장 대기열)를 읽고 확인: 내용은 받은 그대로 쓰고, 저장하지 않은 문서는 `discard` 없이 닫히지 않는다.
- `develop`을 병합한 뒤 `pnpm check` 직접 실행: Vitest 90개, Rust 42개 통과.
- 화면에 연결된 곳이 없어 앱에서 확인할 것은 없다(T-024에서 연결).
- 넘긴 것: 같은 파일을 다른 표기의 경로로 열면 버퍼가 둘이 되는 문제(MVP 이후 검토), 저장 중 이름 변경(T-023), 외부 변경 시 다시 읽기(T-052).
