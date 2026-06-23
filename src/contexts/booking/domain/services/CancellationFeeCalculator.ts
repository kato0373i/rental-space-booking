import type { Money } from "../../../../shared/domain/Money.js";
import type { CancellationPolicy } from "../CancellationPolicy.js";

export type CancellationCharge = {
  readonly ratePct: number;
  readonly fee: Money;
  readonly refund: Money;
};

/**
 * キャンセル料計算ドメインサービス（FR-015/019）。純粋・副作用なし。
 * キャンセル料 = 確定額 × f(残時間, 料率)。返金額 = 確定額 − キャンセル料。
 * 管理者の強制キャンセル時のみ料率0%上書きが可能（U-06）。
 */
export const CancellationFeeCalculator = {
  charge(
    policy: CancellationPolicy,
    remainingHours: number,
    confirmedPrice: Money,
    overrideZeroRate = false,
  ): CancellationCharge {
    const ratePct = overrideZeroRate ? 0 : policy.feeRatePctFor(remainingHours);
    const fee = confirmedPrice.applyRatePct(ratePct);
    const refund = confirmedPrice.subtractClamped(fee);
    return { ratePct, fee, refund };
  },
};
