import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest 전역(`globals`)을 켜지 않으므로 Testing Library의 자동 정리를 직접 등록합니다.
afterEach(() => {
  cleanup();
});
