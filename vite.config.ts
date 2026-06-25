import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// フロントは src/ui をエントリにブラウザ内でアプリ層を直接呼ぶ SPA（ADR-F01）。
export default defineConfig({
  plugins: [react()],
  server: { open: false },
});
