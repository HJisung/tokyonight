import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  // Rust 쪽은 clippy가 검사합니다. `.claude/`에는 로컬에 설치한 외부 스킬이 들어 있습니다.
  globalIgnores(["dist/", "src-tauri/", ".claude/", ".superpowers/"]),
  js.configs.recommended,
  tseslint.configs.recommended,
);
