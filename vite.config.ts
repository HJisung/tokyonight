import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Tauri 개발에 맞춘 설정입니다.
  // 1. Rust 오류가 Vite 출력에 가려지지 않게 합니다.
  clearScreen: false,
  // 2. Tauri는 고정 포트를 기대하므로, 포트를 쓸 수 없으면 실패하게 합니다.
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. `src-tauri`는 Vite가 감시하지 않습니다.
      ignored: ["**/src-tauri/**"],
    },
  },
});
