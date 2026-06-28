import { Scope } from "@aws-blocks/core";
import { AsyncJob } from "@aws-blocks/blocks";
import type { PaymentSettlement } from "../contexts/booking/application/SettleReservationPayment.js";
import {
  StripeWebhookProcessor,
  type StripeWebhookVerifier,
} from "../contexts/payment/infrastructure/StripeWebhookProcessor.js";
import type { Container } from "./container.js";

/**
 * 決済の Webhook → Background jobs オーケストレーション（#14, ADR-AB10）。
 *
 * AWS Blocks に決済 Block は無いため、外部プロバイダ（Stripe）の Webhook を受け、決済決着を
 * Background jobs Block（AsyncJob）に投入して非同期・冪等・リトライ付きで予約へ反映する。
 * 予約状態の実遷移は {@link SettleReservationPayment}（冪等）が担う。
 */

/**
 * 決済決着を1件処理する（AsyncJob ハンドラ本体）。失敗は throw して AsyncJob のリトライ/DLQ に委ねる
 * （Webhook が予約永続化に先着した場合の再試行を含む）。タイマー非依存でテスト・手動実行から共通利用する。
 */
export async function runSettlement(
  container: Container,
  settlement: PaymentSettlement,
): Promise<void> {
  const result = await container.settleReservationPayment.execute(settlement);
  if (!result.ok) {
    throw new Error(`決済決着の反映に失敗しました: ${JSON.stringify(result.error)}`);
  }
}

/**
 * 決済決着を処理する Background job（AsyncJob）を構築する。`submit(settlement)` で投入され、
 * ワーカーが {@link runSettlement} を実行する。失敗は自動リトライ→`maxRetries` 超過で DLQ。
 */
export function createPaymentSettlementJob(
  container: Container,
  options: { readonly scope?: Scope; readonly maxRetries?: number } = {},
): AsyncJob<PaymentSettlement> {
  const scope = options.scope ?? new Scope("rental-space-booking");
  return new AsyncJob<PaymentSettlement>(scope, "payment-settlement", {
    // 決済決着は確実に反映したいので予約イベントより多めに再試行する。
    maxRetries: options.maxRetries ?? 5,
    handler: async (settlement) => {
      await runSettlement(container, settlement);
    },
  });
}

/**
 * Stripe Webhook 受信器を Background jobs 投入で組み立てる（デプロイ/実行エントリから呼ぶ）。
 * 署名検証（`verifier`）と決済決着投入（AsyncJob）を結線する。実 Stripe SDK の verifier はデプロイ時に注入する。
 */
export function createStripeWebhookProcessor(
  container: Container,
  verifier: StripeWebhookVerifier,
  options: { readonly scope?: Scope; readonly maxRetries?: number } = {},
): StripeWebhookProcessor {
  const job = createPaymentSettlementJob(container, options);
  return new StripeWebhookProcessor(verifier, (settlement) => {
    void job.submit(settlement).catch((e: unknown) => {
      console.error(`[決済Webhook] ジョブ投入失敗 予約=${settlement.reservationId}`, e);
    });
  });
}
