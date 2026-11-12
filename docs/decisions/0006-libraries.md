# 0006 사용 라이브러리

- 날짜: 2026-11-12
- 상태: 확정
- 결정자: 사용자

| 라이브러리 | 용도 | 쓰이는 task |
| --- | --- | --- |
| Tailwind CSS v4, shadcn/ui | 스타일, 기본 UI 컴포넌트 | T-003 |
| CodeMirror 6 | 편집기 | T-024, T-030 |
| Zustand | 문서·분할·워크스페이스 상태 | T-021, T-040, T-041 |
| react-resizable-panels | 분할 영역 크기 조절 | T-040 |
| lucide-react | 아이콘 | T-010 |
| @tanstack/react-virtual | 파일 목록 가상화 | T-023 |
| dnd-kit | 탭 순서 변경 | T-041 |
| Vitest, Testing Library | 단위·컴포넌트 테스트 | T-004 |
| Tauri 플러그인 `dialog`, `fs` | 폴더·파일 선택, 파일 접근 | T-020 |
| Rust `notify`, `ignore`, `tempfile` | 변경 감시, 폴더 탐색, 테스트용 임시 폴더 | T-020 이후 |

이 표에 없는 라이브러리를 추가하려면 이유를 적어 사용자 승인을 받는다.
