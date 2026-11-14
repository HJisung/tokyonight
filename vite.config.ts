import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri 개발 서버는 고정 포트를 기대한다.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true }
})
