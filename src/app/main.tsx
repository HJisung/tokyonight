import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyInitialTheme } from "@/features/shell";
import "@/styles/index.css";
import { App } from "./App";

// 첫 화면을 그리기 전에 시스템 테마를 적용합니다.
applyInitialTheme();

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root 요소를 찾을 수 없습니다.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
