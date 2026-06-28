import type { AppServices } from "../../composition/webFacade.js";
import { createBlocksAppServices, type BlocksClient } from "./blocksClient.js";

/**
 * AWS Blocks の型安全クライアント（`import { app, admin } from "aws-blocks"`）から `AppServices` を作る（#15）。
 *
 * `"aws-blocks"` は AWS Blocks のランタイム（`npm run dev:blocks` / デプロイ）が解決する型付きクライアントで、
 * バックエンド `aws-blocks/index.ts` の RPC をミラーする。プレーンな `vite`（既定の memory 経路）では
 * このモジュールは読み込まれないため、動的 import を `@vite-ignore` でバンドル解析から除外する。
 */
export async function createBlocksServicesFromClient(): Promise<AppServices> {
  const client = (await import(/* @vite-ignore */ "aws-blocks")) as unknown as BlocksClient;
  return createBlocksAppServices(client);
}
