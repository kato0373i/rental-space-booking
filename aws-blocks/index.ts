// AWS Blocks アプリ定義（バックエンドのリソース境界）。
//
// dev サーバ（`npm run dev:blocks`）／sandbox／deploy は、いずれもこの
// `aws-blocks/index.ts` を入口に読む。各コンテキストの Building Block ベースの
// アダプタ（予約=Database, スペース=Database, 認証=Cognito, 通知=SES/Realtime,
// リマインド=CronJob, イベント=AsyncJob）は Issue #8 以降で順次追加していく。
//
// 本ファイル（#7 基盤）は「アプリ境界(Scope)」と「型付き RPC の入口(ApiNamespace)」
// という土台のみを定義する。ドメイン/アプリ層（src/contexts 配下の純TS）には一切
// 依存しないし、依存させない。アダプタ追加時もドメインは無変更で済む構成にする。
import { ApiNamespace, Scope } from "@aws-blocks/core";

/** このアプリのリソース境界（NFR-006 のインメモリ/RDS 切替点の Blocks 版）。 */
export const scope = new Scope("rental-space-booking");

/**
 * 疎通確認用の最小 RPC。
 * 型付きクライアント（`import { health } from "aws-blocks"`）から
 * `await health.ping()` で到達できることを保証する“通り道”を最初に通しておく。
 * 認証ゲートは付けない（公開エンドポイント）。実フローの RPC は #15 で整備する。
 */
export const health = new ApiNamespace(scope, "health", () => ({
  async ping() {
    return { status: "ok" as const, at: new Date().toISOString() };
  },
}));
