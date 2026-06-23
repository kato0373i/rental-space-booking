import type { Result } from "./Result.js";
import { err, ok } from "./Result.js";

/**
 * 金額の値オブジェクト。通貨は JPY 単一（NFR-007, P-07）。
 * 多通貨は将来拡張とし、ここでは通貨コードを内部に固定して拡張余地のみ残す。
 * 金額は円単位の非負整数（小数・負数を持たない）。
 */
export class Money {
  static readonly CURRENCY = "JPY" as const;

  private constructor(readonly amount: number) {}

  static of(amount: number): Result<Money, string> {
    if (!Number.isInteger(amount)) return err(`金額は整数（円）である必要があります: ${amount}`);
    if (amount < 0) return err(`金額は0以上である必要があります: ${amount}`);
    return ok(new Money(amount));
  }

  /** バリデーション済みであることが自明な内部生成用（不正値はプログラミングエラー）。 */
  static ofUnsafe(amount: number): Money {
    const r = Money.of(amount);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }

  static readonly ZERO = new Money(0);

  add(other: Money): Money {
    return new Money(this.amount + other.amount);
  }

  /** this - other。0未満になる場合は 0 にクランプ（返金額が負にならないため）。 */
  subtractClamped(other: Money): Money {
    return new Money(Math.max(0, this.amount - other.amount));
  }

  /** 料率（0–100%）を適用した金額。四捨五入で円単位に丸める。 */
  applyRatePct(ratePct: number): Money {
    return new Money(Math.round((this.amount * ratePct) / 100));
  }

  equals(other: Money): boolean {
    return this.amount === other.amount;
  }

  toString(): string {
    return `${Money.CURRENCY} ${this.amount.toLocaleString("ja-JP")}`;
  }
}
