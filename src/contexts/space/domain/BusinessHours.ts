import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";

/**
 * 営業時間 VO（FR-004）。同一日内（JST）の開始・終了を 0:00 からの分で保持する。
 * 日跨ぎ営業は対象外（U-02）。
 */
export class BusinessHours {
  private constructor(
    readonly openMinute: number,
    readonly closeMinute: number,
  ) {}

  /** 時・分（JST）から構築。例: of(9,0,18,0) → 09:00–18:00。 */
  static of(
    openHour: number,
    openMinute: number,
    closeHour: number,
    closeMinute: number,
  ): Result<BusinessHours, string> {
    const open = openHour * 60 + openMinute;
    const close = closeHour * 60 + closeMinute;
    if (open < 0 || close > 24 * 60) return err("営業時間は0:00–24:00の範囲です");
    if (open >= close) return err("営業開始は営業終了より前である必要があります");
    return ok(new BusinessHours(open, close));
  }

  /** 営業時間の長さ（分）。 */
  spanMinutes(): number {
    return this.closeMinute - this.openMinute;
  }

  /** 指定の「0:00からの分」が営業時間内（[open, close)）か。 */
  containsMinuteOfDay(minuteOfDay: number): boolean {
    return minuteOfDay >= this.openMinute && minuteOfDay < this.closeMinute;
  }
}
