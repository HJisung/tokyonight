# 브라우저 E2E

```sh
npm install
npx playwright install chromium webkit
npm run test:e2e
```

Playwright가 포트 **1420**에 Vite를 띄우고 종료 시 서버를 정리한다. 다른 Vite/Tauri 개발 서버가 그 포트를 사용 중이면 먼저 종료해야 한다. Tauri/Rust 프로세스는 실행하지 않는다.

- 프로젝트: Chromium/WebKit × dark/light, 기본 1280×900, 최소 창 640×600.
- `fixtures.ts`는 페이지 초기화 전에 `__TAURI_INTERNALS__`와 이벤트 콜백 레지스트리를 주입한다. 실제 Tauri JS 래퍼와 앱 전체를 그대로 실행한다.
- `fake-backend.ts`는 Node 메모리에 파일·세션·임시 메모를 보관한다. 브라우저 reload에서도 유지되며 각 테스트는 격리된다. 명령 호출·인수·결과·오류를 기록한다. 알 수 없는 IPC와 네이티브 메시지 대화상자는 실패한다.
- 파일 오류 코드, UTF-8/NUL/20MB 제한, BOM/줄바꿈, mtime 및 기준 원문 비교, 실제 경로 확인, create-new, 복사 이름 충돌, 폴더 복사 병합, 최근 폴더 12개, 임시 메모 ID, 검색 한도는 Rust 구현을 기준으로 한다.
- 스크린샷: `screenshots/<project>-<step>.png`. `review-*.png`는 원본을 4장씩 배치한 검토용 캡처다. 실패 trace와 화면은 `test-results/`, HTML 보고서는 `playwright-report/`에 남는다. 모두 gitignore 대상이다.
- 브라우저 콘솔 오류와 pageerror는 각 테스트의 실패 조건이다. Vitest는 e2e 디렉터리를 수집하지 않는다.

검증 범위는 웹뷰 UI와 IPC 계약이다. 실제 OS 권한·심볼릭 링크·휴지통·원자적 쓰기·파일 감시기 타이밍·네이티브 창 동작은 가짜 백엔드로 증명할 수 없다. 가짜 경로는 POSIX 형식이다. 실제 Windows 및 Tauri 통합 확인은 별도로 필요하다.
