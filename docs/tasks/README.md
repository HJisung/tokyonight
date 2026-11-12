# 작업 목록

TokyoNight 첫 버전 로드맵입니다. 작업 방식은 [`docs/harness.md`](../harness.md)를 따릅니다.

- 상태: `draft`(에이전트가 작성 중) → `proposed`(사용자 검수 대기) → `ready`(사용자 승인, 위임 가능) → `in-progress` → `review` → `done`, 그리고 `blocked`.
- 사용자가 승인하지 않은 task는 시작하지 않습니다. 승인하면 task 파일의 `검수`에 날짜를 적습니다.
- 상태의 원본은 각 task 파일입니다. 상태를 바꾸면 이 표도 함께 고칩니다.
- M2 이후 task는 M1의 결정에 따라 달라지므로 `draft`입니다. T-015(아키텍처 설계)에서 다시 구체화합니다.
- MVP 범위와 진행 순서는 [`MVP.md`](MVP.md)에 있습니다.
- 새 task는 [`_template.md`](_template.md)를 복사해 만듭니다.

## M0 하네스·개발 환경

| ID | 작업 | 상태 | 의존 | 담당 |
| --- | --- | --- | --- | --- |
| [T-001](T-001-dev-toolchain.md) | 개발 도구 설치·확인 | done | - | 사용자+오케스트레이터 |
| [T-002](T-002-herdr-delegation.md) | Herdr 위임 경로 구축·스모크 테스트 | in-progress | - | 사용자+오케스트레이터 |
| [T-003](T-003-scaffold.md) | Tauri 2 + React + TypeScript 스캐폴딩 | ready | T-001 | 구현자 |
| [T-004](T-004-verify-gate.md) | 검증 게이트 `pnpm check` 구성 | ready | T-003 | 구현자 |
| [T-005](T-005-ci.md) | CI/CD: macOS·Windows에서 check·빌드, 릴리스 초안 | proposed | T-004 | 구현자 |

## M1 미정 사항 결정

| ID | 작업 | 상태 | 의존 | 담당 |
| --- | --- | --- | --- | --- |
| [T-010](T-010-screen-design.md) | 화면 구성, DESIGN.md, 앱 뼈대 | proposed | T-004 | 구현자(`impeccable` 스킬 사용) |
| [T-011](T-011-editor-spike.md) | 편집기 라이브러리 선정 스파이크 | done | T-003 | 구현자+리뷰어 |
| [T-012](T-012-markdown-preservation.md) | Markdown 보존 방식 결정과 왕복 테스트 코퍼스 | proposed | T-011 | 구현자+리뷰어 |
| [T-013](T-013-state-storage.md) | 작업 상태·복구 데이터의 저장 위치와 형식 | done | - | 오케스트레이터+사용자 |
| [T-014](T-014-conflict-policy.md) | 외부 변경·이름 충돌·복원의 세부 동작 | proposed | T-010 | 오케스트레이터+사용자 |
| [T-015](T-015-architecture.md) | 아키텍처 설계 | proposed | T-011, T-012, T-013, T-014 | 오케스트레이터+리뷰어 |
| [T-016](T-016-perf-test-strategy.md) | 성능 목표와 테스트 전략 | proposed | T-011 | 오케스트레이터+사용자 |

## M2 파일·문서 코어

| ID | 작업 | 상태 | 의존 | 담당 |
| --- | --- | --- | --- | --- |
| [T-020](T-020-fs-backend.md) | 파일 시스템 백엔드 | proposed | T-004 | 구현자 |
| [T-021](T-021-document-store.md) | 문서 저장소: 단일 버퍼와 다중 뷰 | proposed | T-020 | 구현자 |
| [T-022](T-022-start-screen.md) | 시작 화면 | proposed | T-023, T-024 | 구현자(`impeccable` 스킬 사용) |
| [T-023](T-023-file-tree.md) | 파일 목록 사이드바 | proposed | T-020, T-021, T-010 | 구현자 |
| [T-024](T-024-plain-text-editor.md) | 일반 텍스트 편집 (CodeMirror 6) | proposed | T-021, T-010 | 구현자 |
| [T-025](T-025-scratch-notes.md) | 임시 메모 | proposed | T-024 | 구현자 |
| [T-026](T-026-new-and-external-files.md) | 새 파일 만들기와 폴더 밖 파일 열기 | proposed | T-023, T-024 | 구현자 |

## M3 Markdown 편집

| ID | 작업 | 상태 | 의존 | 담당 |
| --- | --- | --- | --- | --- |
| [T-030](T-030-markdown-wysiwyg.md) | Markdown 라이브 프리뷰 | proposed | T-024 | 구현자(`impeccable` 스킬 사용) |
| [T-031](T-031-source-mode.md) | 원문 편집 모드 전환 | proposed | T-030 | 구현자 |
| [T-032](T-032-tables.md) | 기본 표 | draft | T-030 | 구현자 |
| [T-033](T-033-footnotes.md) | 각주 | draft | T-030 | 구현자 |
| [T-034](T-034-roundtrip-verification.md) | 미지원 문법 보존 검증 | draft | T-031, T-032, T-033 | 리뷰어+구현자 |

## M4 작업 화면

| ID | 작업 | 상태 | 의존 | 담당 |
| --- | --- | --- | --- | --- |
| [T-040](T-040-split-panes.md) | 분할 영역 | proposed | T-024, T-010 | 구현자 |
| [T-041](T-041-workspace-tabs.md) | 워크스페이스 탭 | proposed | T-040 | 구현자 |
| [T-042](T-042-workspace-persistence.md) | 워크스페이스 상태 저장·복원 | draft | T-041, T-013 | 구현자 |
| [T-043](T-043-drag-drop-copy.md) | 외부 파일·폴더 끌어다 놓기 | draft | T-023, T-014 | 구현자 |

## M5 저장·안정성·검색

| ID | 작업 | 상태 | 의존 | 담당 |
| --- | --- | --- | --- | --- |
| [T-050](T-050-autosave.md) | 자동 저장 | draft | T-024, T-014 | 구현자 |
| [T-051](T-051-scratch-recovery.md) | 임시 메모 복구와 재실행 시 복원 | draft | T-025, T-013 | 구현자 |
| [T-052](T-052-external-change-detection.md) | 외부 변경 감지와 충돌 처리 | draft | T-020, T-014 | 구현자 |
| [T-053](T-053-search.md) | 파일 이름·문서 내용 검색 | draft | T-020, T-023 | 구현자 |
| [T-054](T-054-recent-work.md) | 최근 작업 | draft | T-022, T-014, T-042 | 구현자 |

## M6 출시 준비

| ID | 작업 | 상태 | 의존 | 담당 |
| --- | --- | --- | --- | --- |
| [T-060](T-060-perf-measurement.md) | 성능 측정과 개선 | draft | T-016, T-053 | 구현자+리뷰어 |
| [T-061](T-061-windows-verification.md) | Windows 검증 | draft | T-005 | 사용자+구현자 |
| [T-062](T-062-packaging.md) | 빌드·배포 | draft | T-005 | 사용자+구현자 |
| [T-063](T-063-e2e-smoke.md) | E2E 스모크 테스트 | draft | T-016, T-042 | 구현자 |
