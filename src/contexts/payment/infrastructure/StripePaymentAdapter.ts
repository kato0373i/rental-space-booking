import type { Money } from "../../../shared/domain/Money.js";
import type {
  PaymentOutcome,
  PaymentPort,
  RefundOutcome,
} from "../../booking/application/ports/PaymentPort.js";

/**
 * 外部決済プロバイダ（Stripe 等）への最小トランスポート面（ADR-AB10）。
 *
 * AWS Blocks に決済 Block は無いため、決済は外部 SaaS の SDK（`stripe`）で行う。具体 SDK に結合せず
 * このインターフェース越しに使い、テストでは fake を注入する（SES/Cognito アダプタと同方針）。
 * 実 SDK 実装（`stripe.paymentIntents.create({...}, { idempotencyKey })` 等）はデプロイ時に差し込む。
 */
export interface StripeGateway {
  /**
   * 与信（サーバサイドの PaymentIntent 作成＋確定）。`idempotencyKey` で二重課金を防ぐ。
   * `reservationId` は PaymentIntent の metadata に載せ、Webhook 受信時に予約と突合する。
   */
  createCharge(params: {
    readonly idempotencyKey: string;
    readonly amountJpy: number;
    readonly reservationId: string;
  }): Promise<StripeChargeResult>;
  /** 返金（Refund 作成）。`idempotencyKey` で二重返金を防ぐ。 */
  createRefund(params: {
    readonly idempotencyKey: string;
    readonly amountJpy: number;
  }): Promise<StripeRefundResult>;
}

export type StripeChargeResult =
  | { readonly status: "succeeded" }
  | { readonly status: "failed"; readonly reason: string }
  /** ネットワーク/プロバイダ無応答。確定不明のため予約は中断し、Webhook で後追い決着させる。 */
  | { readonly status: "timeout" };

export type StripeRefundResult =
  | { readonly status: "succeeded" }
  | { readonly status: "failed"; readonly reason: string };

/**
 * 決済ポートの外部プロバイダ（Stripe）実装（#14, ADR-AB10）。
 * 同期与信は {@link PlaceReservation} の Saga から呼ばれ「決済成功で確定」を満たす（コア決定）。
 * 非同期/取りこぼし（timeout 後の実成立など）は Webhook → Background jobs で後追い決着する
 * （{@link SettleReservationPayment}）。冪等キーは予約ID（FR-020）。
 *
 * NFR-002: カード番号等の生決済情報はアダプタ内にも持たない（プロバイダ側トークンのみ）。
 */
export class StripePaymentAdapter implements PaymentPort {
  constructor(private readonly gateway: StripeGateway) {}

  async charge(idempotencyKey: string, amount: Money): Promise<PaymentOutcome> {
    const result = await this.gateway.createCharge({
      idempotencyKey,
      amountJpy: amount.amount,
      reservationId: idempotencyKey, // 冪等キー = 予約ID（FR-020）。Webhook 突合にも用いる。
    });
    switch (result.status) {
      case "succeeded":
        return { kind: "Succeeded" };
      case "timeout":
        return { kind: "TimedOut" };
      default:
        return { kind: "Failed", reason: result.reason };
    }
  }

  async refund(idempotencyKey: string, amount: Money): Promise<RefundOutcome> {
    const result = await this.gateway.createRefund({ idempotencyKey, amountJpy: amount.amount });
    return result.status === "succeeded"
      ? { kind: "Refunded" }
      : { kind: "Failed", reason: result.reason };
  }
}
