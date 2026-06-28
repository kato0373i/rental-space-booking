import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// フロントは src/ui をエントリにブラウザ内でアプリ層を直接呼ぶ SPA（既定 memory, ADR-F01）。
// VITE_BACKEND=blocks のときのみ AWS Blocks 型安全クライアント "aws-blocks" を動的 import する（#15）。
// その解決は AWS Blocks ランタイム（dev:blocks / デプロイ）が供給するため、通常ビルドでは外部依存として扱う
// （既定 memory 経路では読み込まれない）。
export default defineConfig({
  plugins: [react()],
  server: { open: false },
  // AWS Blocks 配線（blocksWiring）は blocks 経路でのみ動的 import され、既定 memory バンドルには含めない。
  // そのチャンクが参照する Node 専用依存（@aws-blocks/*, node:*）と型安全クライアント "aws-blocks" は
  // ブラウザビルドで外部依存として扱う（解決は dev:blocks / デプロイのランタイムが供給, #6/ADR-AB11）。
  build: { rollupOptions: { external: ["aws-blocks", /^@aws-blocks\//, /^node:/] } },
});
