// AWS Blocks ローカル開発サーバ（モック実装・AWSアカウント不要）の起動ランナー。
// `npm run dev:blocks` から呼ぶ。バックエンド(aws-blocks/index.ts)を読み込み、
// 既存の Vite SPA をフロントエンドとしてプロキシ配下に置く。
//
// バックエンドのみ起動したい場合は frontendCommand を外す。
import { startDevServer } from "@aws-blocks/core/scripts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await startDevServer({
  port: 3000,
  backendPath: join(root, "aws-blocks", "index.ts"),
  // 既存のゲスト予約 SPA（src/ui）をそのままフロントに使う。
  frontendCommand: "npx vite --port 3100 --strictPort",
  frontendPort: 3100,
});
