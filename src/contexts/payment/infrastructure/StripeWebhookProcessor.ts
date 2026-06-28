import { ReservationId } from "../../../shared/domain/Id.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { ValidationError } from "../../../shared/errors.js";
import { validationError } from "../../../shared/errors.js";
import type { PaymentSettlement } from "../../booking/application/SettleReservationPayment.js";

/** 署名検証済みの Stripe Webhook イベント（必要な種別のみに正規化）。 */
export type StripeWebhookEvent =
  | { readonly type: "payment_intent.succeeded"; readonly reservationId: string }
  | {
      readonly type: "payment_intent.payment_failed";
      readonly reservationId: string;
      readonly reason: string;
    }
  /** 関心外のイベント（無視する）。 */
  | { readonly type: "other" };

/**
 * Webhook 署名検証＋パースの最小面（Stripe SDK の `stripe.webhooks.constructEvent` 相当）。
 * 署名不一致・改ざんは例外を投げる。実 SDK 実装はデプロイ時に差し込み、テストでは fake を注入する。
 */
export interface StripeWebhookVerifier {
  constructEvent(rawBody: string, signature: string): StripeWebhookEvent;
}

/** 決済決着を Background jobs へ投入するディスパッチ（合成ルートが供給, ADR-AB10）。 */
export type SettlementDispatch = (settlement: PaymentSettlement) => void;

/**
 * Stripe Webhook の受信処理（#14, ADR-AB10）。署名検証 → 決済決着（{@link PaymentSettlement}）への正規化
 * → Background jobs への投入を行う。予約状態の実遷移は非同期ワーカー（{@link SettleReservationPayment}）が
 * 冪等に担うため、本処理は「検証して投入する」までで完結し、エンドポイント応答を即時に返せる。
 *
 * NFR-002: 予約の突合は metadata の `reservationId`（非PII の論理ID）のみで行う。生決済情報は扱わない。
 */
export class StripeWebhookProcessor {
  constructor(
    private readonly verifier: StripeWebhookVerifier,
    private readonly dispatch: SettlementDispatch,
  ) {}

  handle(rawBody: string, signature: string): Result<{ readonly handled: boolean }, ValidationError> {
    let event: StripeWebhookEvent;
    try {
      event = this.verifier.constructEvent(rawBody, signature);
    } catch {
      // 署名不一致・改ざん。生エラーは載せない（情報漏洩防止）。
      return err(validationError("Webhook 署名の検証に失敗しました"));
    }

    switch (event.type) {
      case "payment_intent.succeeded":
        this.dispatch({
          reservationId: ReservationId.of(event.reservationId),
          outcome: { kind: "Succeeded" },
        });
        return ok({ handled: true });
      case "payment_intent.payment_failed":
        this.dispatch({
          reservationId: ReservationId.of(event.reservationId),
          outcome: { kind: "Failed", reason: event.reason },
        });
        return ok({ handled: true });
      default:
        // 関心外イベントは正常応答（再送ループを避ける）。
        return ok({ handled: false });
    }
  }
}
