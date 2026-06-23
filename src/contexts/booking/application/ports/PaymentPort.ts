import type { Money } from "../../../../shared/domain/Money.js";

/** 与信結果（FR-012/020）。 */
export type PaymentOutcome =
  | { readonly kind: "Succeeded" }
  | { readonly kind: "Failed"; readonly reason: string }
  | { readonly kind: "TimedOut" };

/** 返金結果（FR-021）。 */
export type RefundOutcome =
  | { readonly kind: "Refunded" }
  | { readonly kind: "Failed"; readonly reason: string };

/**
 * 決済ポート（Booking が所有, ADR-001）。実装はモックアダプタ。
 * 冪等キー（= ReservationId）で二重課金・二重返金を防止する（FR-020）。
 */
export interface PaymentPort {
  charge(idempotencyKey: string, amount: Money): Promise<PaymentOutcome>;
  refund(idempotencyKey: string, amount: Money): Promise<RefundOutcome>;
}
