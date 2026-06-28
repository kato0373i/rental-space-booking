import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// フロントは src/ui をエントリにブラウザ内でアプリ層を直接呼ぶ SPA（既定 memory, ADR-F01）。
// VITE_BACKEND=blocks のときのみ AWS Blocks 型安全クライアント "aws-blocks" を動的 import する（#15）。
// その解決は AWS Blocks ランタイム（dev:blocks / デプロイ）が供給するため、通常ビルドでは外部依存として扱う
// （既定 memory 経路では読み込まれない）。
export default defineConfig({
  plugins: [react()],
  server: { open: false },
  build: { rollupOptions: { external: ["aws-blocks"] } },
});
