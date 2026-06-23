import type { DayKind } from "../../../shared/domain/JstDateTime.js";
import { Money } from "../../../shared/domain/Money.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";

/**
 * 料金規則 VO（FR-005）。「曜日区分 × 時間帯 → スロット単価」の1区分。
 * 時間帯は 0:00 からの分で [fromMinute, toMinute) を表す。
 */
export class RateRule {
  private constructor(
    readonly dayKind: DayKind,
    readonly fromMinute: number,
    readonly toMinute: number,
    readonly unitPrice: Money,
  ) {}

  static of(
    dayKind: DayKind,
    fromHour: number,
    fromMinute: number,
    toHour: number,
    toMinute: number,
    unitPriceJpy: number,
  ): Result<RateRule, string> {
    const from = fromHour * 60 + fromMinute;
    const to = toHour * 60 + toMinute;
    if (from >= to) return err("料金規則の開始は終了より前である必要があります");
    const price = Money.of(unitPriceJpy);
    if (!price.ok) return err(price.error);
    return ok(new RateRule(dayKind, from, to, price.value));
  }

  /** 指定の曜日区分・スロット開始分（0:00から）がこの規則に該当するか。 */
  matches(dayKind: DayKind, slotStartMinuteOfDay: number): boolean {
    return (
      this.dayKind === dayKind &&
      slotStartMinuteOfDay >= this.fromMinute &&
      slotStartMinuteOfDay < this.toMinute
    );
  }
}
