# 데이터 안전성 리뷰

대상: `src/docs.ts`, `actions.ts`, `store.ts`, `editor/index.ts`, `editor/table.ts`, `src-tauri/src/files.rs`, `store.rs`, `watch.rs` 및 이들이 호출하는 API·경로·텍스트 도구.

## 재현하고 수정한 문제

P1은 사용자 원문이나 다른 파일을 잃을 수 있는 경로, P2는 복구·상태·사용자 선택이 어긋나는 경로다. 아래 결함은 수정 전에 실패하는 Vitest 또는 Rust 테스트를 실행해 확인했다.

| 심각도 | 문제와 결과 | 최종 변경 | 주요 회귀 테스트 |
| --- | --- | --- | --- |
| P1 | 링크를 드롭하면 충돌 확인은 링크 이름으로 하지만 실제 복사는 대상 파일 이름으로 수행해 다른 파일을 덮어씀 | 선택한 원본 이름을 유지 | `copying_a_symlink_uses_the_name_that_was_checked_for_conflicts` |
| P1 | 폴더 복사가 대상의 하위 링크를 따라 선택한 폴더 밖 파일을 덮어씀 | 하위 원본 링크 및 대상 링크 거부. 기존 파일은 임시 파일 쓰기 성공 후 교체 | `directory_copy_does_not_follow_destination_symlinks_outside_the_target` |
| P1 | 원자적 쓰기가 마지막 경로를 다시 정규화하면 바뀐 링크의 다른 대상에 기록할 수 있음 | 열 때 실제 경로를 결정하고 쓰기는 마지막 링크를 재추적하지 않음. 정상 저장 경로가 링크가 되었으면 거부 | `replacing_a_symlink_never_writes_its_unrelated_target` |
| P1 | mtime이 같은 외부 수정은 자동 저장이 덮어씀. 최초 검사 후 임시 파일 쓰기 중에 생긴 외부 수정도 덮어씀 | 기준 원문과 mtime을 함께 비교. 프로세스 내 파일 명령 직렬화. 임시 쓰기 완료 후 최종 검사 | `stale_content_with_unchanged_mtime_must_not_be_overwritten`, `change_while_the_temp_file_is_written_must_not_be_overwritten`, E2E 같은 mtime 충돌 |
| P1 | PID만 사용한 임시 파일명이 다른 쓰기 또는 이미 있는 파일과 충돌해 내용을 자르거나 지움 | 배타적 `create_new`와 고유 번호, 자신의 임시 파일만 정리 | `atomic_write_does_not_truncate_an_unrelated_existing_temp_file` |
| P1 | 디스크 불러오기를 기다리는 동안 추가한 입력까지 앞선 버리기 동의로 간주해 삭제 | 요청 당시 Text·revision을 비교하고 그 뒤 변경이 있으면 불러오기 취소 | Vitest `디스크 불러오기 도중 추가 입력은 버리기 동의에 포함되지 않는다` |
| P2 | “변경 버리고 닫기” 뒤 수거기가 저장을 재시도해 버린 내용을 디스크에 기록 | 폐기 승인 시 타이머 중단, 수거 시 재저장하지 않음 | Vitest `변경 버리기를 승인한 문서는 정리하면서 다시 저장하지 않는다`, E2E 작업 삭제 |
| P2 | 이름 변경이 끊어진 대상 링크를 없는 경로로 간주하거나 같은 파일을 가리키는 다른 링크를 같은 디렉터리 항목으로 오인해 확인 없이 교체 | lstat로 존재 여부와 실제 디렉터리 항목을 구분 | `rename_does_not_replace_an_unconfirmed_dangling_symlink`, `rename_does_not_replace_a_different_link_to_the_same_file` |
| P2 | 다른 표기의 같은 파일을 별도 세션으로 열어 동기화·저장 대기·경로 이동이 분리됨 | `resolve_path` IPC로 열기·복원 경로 통합. 이름 변경·삭제에서는 링크 자체와 실제 파일을 구분 | Vitest 별칭 문서 세션, Rust `resolve_path_unifies_dot_and_symlink_aliases`, E2E 별칭 동기화 |
| P2 | 임시 메모 인덱스 손상·누락 또는 본문 성공 후 인덱스 실패로 기존 메모가 목록에서 사라짐 | 본문 파일을 기준으로 목록 재구성, 개별 메타데이터 보관. 손상 본문도 목록에 남기고 열기 오류 표시 | `missing_or_broken_scratch_index_does_not_hide_existing_content`, `an_unreadable_orphan_still_appears_in_the_recovery_list` |
| P2 | JSON 손상이 곧 빈 상태가 되며 저장하면 이전 상태의 복구 근거가 사라짐 | 마지막 유효 JSON `.bak` 유지·로드, 손상본 `.corrupt-*` 보관 | `broken_json_recovers_the_last_valid_backup` |
| P2 | 임시 메모 읽기 오류를 “없음”, 삭제 실패를 “성공”으로 반환 | NotFound만 없음으로 취급, 나머지 I/O 오류 전달. 삭제 실패 시 남은 본문은 목록에서 복구 | `scratch_io_errors_are_not_reported_as_missing_or_success` |
| P2 | 세션 전환이 현재 메모 저장보다 먼저 읽은 옛 메타데이터로 제목·형식을 되돌림 | 현재 세션 저장 이후 메모 목록을 다시 읽음 | Vitest 세션 전환 메타데이터 |
| P2 | 손상 세션의 상대 경로를 허용해 앱 CWD의 다른 파일을 열고 저장할 수 있음 | 절대 경로만 복원, 상대 경로·NUL 경로는 빈 영역으로 복원 | Vitest 손상 세션 상대 경로 |

## 추가로 확인한 기존 안전 동작

- 저장 중 추가 입력은 해당 스냅샷 저장 성공만으로 clean이 되지 않으며 후속 flush가 저장한다.
- 저장 오류는 dirty와 원문을 유지하고 영역 띠에 표시한다. 충돌·사라짐에서는 자동 저장하지 않는다.
- 이름 변경·휴지통 이동 전에 관련 문서 저장을 기다리며, 실패하면 파일 조작을 중단한다.
- 영역·워크스페이스의 마지막 참조를 없앨 때 저장 실패를 확인받고 취소할 수 있다. 창 종료도 문서 및 세션 저장을 기다린다.
- 임시 메모의 실제 파일 쓰기가 실패하면 임시 메모를 제거하지 않는다. 제거 요청 자체가 실패하면 화면 참조도 유지한다.
- 표 위젯은 DOM 위치의 원문 일치를 검사한 뒤 그 표 범위만 변경한다. 브라우저에서 표 앞·뒤 문단, BOM, CRLF, 마지막 줄바꿈 있음/없음을 검증했다. 이 리뷰에서는 편집기 두 모듈에 확정된 새 결함을 발견하지 않아 수정하지 않았다.
- `watch.rs`는 보조 감지 수단이다. 읽기/저장 비교를 대체하지 않는다. 부모 폴더 감시와 창 포커스 재확인 경로를 검토했다.

## IPC·저장 형식 변경

- `resolve_path(path)` → `{ path, isSymlink }` 추가. 화면의 시스템 접근은 여전히 `api.ts`를 통한다.
- `write_file`에 `expectedRaw` 추가. `expectedMtimeMs`가 있으면 기준 원문도 필수다. 이전 프런트엔드와 새 백엔드를 섞으면 조용히 쓰는 대신 오류로 거부한다.
- `FileData.raw`는 API가 읽은 정확한 원문이다. 문서 세션의 `savedRaw`는 마지막으로 확인한/저장한 바이트 비교 기준이다.
- 앱 데이터에 JSON `.bak`, `.corrupt-*`, 임시 메모별 `<id>.json`이 추가된다. 사용자 문서 폴더에는 상태 파일을 만들지 않는다.

## 남긴 경계·미확인 항목

1. **외부 프로세스와의 완전한 CAS는 아님.** 최종 원문 검사와 OS rename 사이에 비협조적 외부 프로세스가 쓰는 경합은 남는다. 이름 변경의 “대상 없음” 검사와 rename 사이에 외부 프로세스가 대상을 만드는 경합도 남는다. 프로세스 내부 Mutex는 다른 앱이나 별도 앱 프로세스를 잠그지 않는다. 플랫폼별 조건부 교체 또는 복구 버전 정책을 별도로 설계해야 한다.
2. **하드 링크는 세션 ID로 통합하지 않는다.** canonical path로 심볼릭 링크·`.` 등의 별칭은 합치지만 inode가 같은 다른 디렉터리 항목까지 하나로 합치지는 않는다. 원자적 교체는 하드 링크 관계를 끊을 수 있다.
3. **Windows 실기 미검증.** Unix에서는 lstat dev/inode로 같은 항목인지 검사한다. 비-Unix는 확인 못 한 기존 대상을 거부하므로 Windows의 대소문자만 바꾸는 rename도 거부될 수 있다. 검증 없는 파일 ID 코드는 추가하지 않았다.
4. 폴더 복사는 전체 트랜잭션이 아니다. 중간 오류가 나면 먼저 성공한 복사 항목이 남는다. 하위 링크는 오류로 거부하며 원본은 이동하지 않는다.
5. JSON 백업이 한 번도 생성되지 않았으면 손상된 배치 자체를 완전히 재구성할 수 없다. 기본 배치를 사용하며 임시 메모 본문은 별도 스캔한다. 본문과 메타데이터 모두 손상되었거나 저장 장치 자체가 손상된 경우의 복구 보장은 없다.
6. 혼합 LF/CRLF와 CR 단독 파일은 기존 대표 줄바꿈으로 정규화하는 정책을 유지했다. 동종 LF/CRLF, BOM, 마지막 줄바꿈은 검증했다.
7. 실제 OS 감시 오류·전원 차단·디스크 full·네이티브 한글 IME의 종료/파일 작업 시점은 실기 검증하지 않았다. 권한/디스크 오류의 화면 동작은 실패 주입으로 검증했다. 원문 추가 전송과 백업에 따른 큰 파일 성능도 측정하지 않았다.

## 최종 검증

- `npx tsc --noEmit`: 통과.
- `npm test`: 71개 통과.
- `npm run test:e2e`: Chromium/WebKit × dark/light, 40개 통과.
- `PATH=/opt/homebrew/opt/rustup/bin:$PATH cargo test --manifest-path src-tauri/Cargo.toml`: 19개 통과(임시 쓰기 중 외부 변경 회귀 포함).
- `tauri dev`, git commit은 실행하지 않았다.
