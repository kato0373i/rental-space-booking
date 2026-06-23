import type { Money } from "../../../shared/domain/Money.js";
import type {
  PaymentOutcome,
  PaymentPort,
  RefundOutcome,
} from "../../booking/application/ports/PaymentPort.js";

export type PaymentBehavior = "Succeed" | "Fail" | "Timeout";

/** 与信・返金の軽量レコード（PaymentRecord 相当, ADR-001）。決済情報そのものは保持しない（NFR-002）。 */
type PaymentRecord = {
  readonly amountJpy: number;
  readonly outcome: PaymentOutcome;
  refundedJpy: number;
};

/**
 * 決済モックアダプタ（FR-020/021, NFR-004）。
 * 成功/失敗/タイムアウトを切替でき、冪等キー（= ReservationId）で二重課金・二重返金を防ぐ。
 */
export class MockPaymentAdapter implements PaymentPort {
  private behavior: PaymentBehavior = "Succeed";
  private readonly records = new Map<string, PaymentRecord>();
  /** 実際に新規与信が成立した回数（冪等ヒットは数えない）。二重課金検証用。 */
  private readonly appliedCharges = new Map<string, number>();

  setBehavior(behavior: PaymentBehavior): void {
    this.behavior = behavior;
  }

  async charge(idempotencyKey: string, amount: Money): Promise<PaymentOutcome> {
    const existing = this.records.get(idempotencyKey);
    if (existing) {
      // 冪等: 1回目の結果を返し、再度の与信は行わない（二重課金防止）。
      return existing.outcome;
    }

    const outcome: PaymentOutcome =
      this.behavior === "Succeed"
        ? { kind: "Succeeded" }
        : this.behavior === "Timeout"
          ? { kind: "TimedOut" }
          : { kind: "Failed", reason: "モック決済の失敗" };

    this.records.set(idempotencyKey, { amountJpy: amount.amount, outcome, refundedJpy: 0 });
    if (outcome.kind === "Succeeded") {
      this.appliedCharges.set(idempotencyKey, (this.appliedCharges.get(idempotencyKey) ?? 0) + 1);
    }
    return outcome;
  }

  async refund(idempotencyKey: string, amount: Money): Promise<RefundOutcome> {
    const record = this.records.get(idempotencyKey);
    if (!record || record.outcome.kind !== "Succeeded") {
      return { kind: "Failed", reason: "対象の決済が存在しません" };
    }
    if (record.refundedJpy + amount.amount > record.amountJpy) {
      return { kind: "Failed", reason: "返金額が与信額を超えています" };
    }
    record.refundedJpy += amount.amount;
    return { kind: "Refunded" };
  }

  /** 新規与信が成立した回数（テスト・検証用）。 */
  appliedChargeCount(idempotencyKey: string): number {
    return this.appliedCharges.get(idempotencyKey) ?? 0;
  }

  /** 返金累計額（テスト・検証用）。 */
  refundedTotal(idempotencyKey: string): number {
    return this.records.get(idempotencyKey)?.refundedJpy ?? 0;
  }
}
