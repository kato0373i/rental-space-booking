import type { DayKind, JstDateTime } from "../../../shared/domain/JstDateTime.js";
import { Money } from "../../../shared/domain/Money.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { BusinessHours } from "./BusinessHours.js";
import type { RateRule } from "./RateRule.js";
import type { SlotDefinition } from "./SlotDefinition.js";

const ALL_DAY_KINDS: readonly DayKind[] = ["Weekday", "Saturday", "Sunday"];

/**
 * 料金表 VO（FR-005/011）。曜日区分×時間帯→単価の規則集合。
 * 価格計算ロジックは Space ドメインに残す（ADR-009）。
 * 不被覆スロットは登録時に検出し（FR-005）、実行時も予約不可として扱う（既定単価フォールバックなし）。
 */
export class RatePlan {
  private constructor(private readonly rules: readonly RateRule[]) {}

  static of(rules: readonly RateRule[]): Result<RatePlan, string> {
    if (rules.length === 0) return err("料金表には少なくとも1つの規則が必要です");
    return ok(new RatePlan(rules));
  }

  /** 単一スロットの単価。該当規則がなければ設定不備（被覆漏れ）として Err。 */
  unitPriceFor(slotStart: JstDateTime): Result<Money, string> {
    const dayKind = slotStart.dayKind();
    const minute = slotStart.minuteOfDayJst();
    const rule = this.rules.find((r) => r.matches(dayKind, minute));
    if (!rule) {
      return err(`料金表が ${slotStart.toIsoJst()} の時間帯を被覆していません`);
    }
    return ok(rule.unitPrice);
  }

  /** 連続スロット群の合計金額（FR-011）。1つでも被覆漏れがあれば Err。 */
  quote(slotStarts: readonly JstDateTime[]): Result<Money, string> {
    let total = Money.ZERO;
    for (const start of slotStarts) {
      const unit = this.unitPriceFor(start);
      if (!unit.ok) return unit;
      total = total.add(unit.value);
    }
    return ok(total);
  }

  /**
   * 営業時間内の全スロット（全曜日区分 × 全スロット開始時刻）を被覆しているか検証する（FR-005 / 不変条件③）。
   * 被覆漏れがあれば、その一覧を Err で返す。
   */
  validateCoverage(
    businessHours: BusinessHours,
    slotDef: SlotDefinition,
  ): Result<void, string[]> {
    const missing: string[] = [];
    const { slotMinutes } = slotDef;
    for (const dayKind of ALL_DAY_KINDS) {
      for (
        let start = businessHours.openMinute;
        start + slotMinutes <= businessHours.closeMinute;
        start += slotMinutes
      ) {
        const covered = this.rules.some((r) => r.matches(dayKind, start));
        if (!covered) {
          const hh = String(Math.floor(start / 60)).padStart(2, "0");
          const mm = String(start % 60).padStart(2, "0");
          missing.push(`${dayKind} ${hh}:${mm}`);
        }
      }
    }
    return missing.length === 0 ? ok(undefined) : err(missing);
  }
}
