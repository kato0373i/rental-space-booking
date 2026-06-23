import type { Result } from "./Result.js";
import { err, ok } from "./Result.js";

/** 料金表・キャンセルポリシーで用いる曜日区分（U-02: 祝日・日跨ぎは対象外）。 */
export type DayKind = "Weekday" | "Saturday" | "Sunday";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * HOUR_MS;

/**
 * JST 単一の日時値オブジェクト（NFR-007, P-07）。
 * 内部は UTC エポックミリ秒で保持し、参照系（時刻・曜日）は JST(UTC+9) で計算する。
 * タイムゾーン跨ぎは将来拡張とし、オフセットを内部定数に固定して拡張余地のみ残す。
 */
export class JstDateTime {
  private constructor(readonly epochMillis: number) {}

  static fromEpochMillis(epochMillis: number): JstDateTime {
    return new JstDateTime(epochMillis);
  }

  /** JST の壁時計（年・月・日・時・分）から構築する。month は 1–12。 */
  static ofJst(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
  ): Result<JstDateTime, string> {
    if (month < 1 || month > 12) return err(`月は1–12です: ${month}`);
    if (day < 1 || day > 31) return err(`日が不正です: ${day}`);
    if (hour < 0 || hour > 23) return err(`時は0–23です: ${hour}`);
    if (minute < 0 || minute > 59) return err(`分は0–59です: ${minute}`);
    const utcMillis = Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET_MS;
    return ok(new JstDateTime(utcMillis));
  }

  /** バリデーション済み前提の内部生成用。 */
  static ofJstUnsafe(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
  ): JstDateTime {
    const r = JstDateTime.ofJst(year, month, day, hour, minute);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }

  private jstParts(): Date {
    // JST 壁時計を UTC の getter で読むためにオフセットを足した Date を作る。
    return new Date(this.epochMillis + JST_OFFSET_MS);
  }

  /** JST の曜日（0=日 … 6=土）。 */
  dayOfWeekJst(): number {
    return this.jstParts().getUTCDay();
  }

  dayKind(): DayKind {
    const dow = this.dayOfWeekJst();
    if (dow === 0) return "Sunday";
    if (dow === 6) return "Saturday";
    return "Weekday";
  }

  /** JST の 0:00 からの経過分（時刻帯判定・料金表区分に使う）。 */
  minuteOfDayJst(): number {
    const d = this.jstParts();
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  /** JST の暦日（その日の 00:00 JST）に切り捨てた JstDateTime。 */
  startOfDayJst(): JstDateTime {
    return new JstDateTime(this.epochMillis - this.minuteOfDayJst() * MINUTE_MS);
  }

  addMinutes(minutes: number): JstDateTime {
    return new JstDateTime(this.epochMillis + minutes * MINUTE_MS);
  }

  addDays(days: number): JstDateTime {
    return new JstDateTime(this.epochMillis + days * DAY_MS);
  }

  /** other からの経過時間（時間単位、小数）。this - other を時間で表す。 */
  hoursSince(other: JstDateTime): number {
    return (this.epochMillis - other.epochMillis) / HOUR_MS;
  }

  isBefore(other: JstDateTime): boolean {
    return this.epochMillis < other.epochMillis;
  }

  isAfter(other: JstDateTime): boolean {
    return this.epochMillis > other.epochMillis;
  }

  isAtOrBefore(other: JstDateTime): boolean {
    return this.epochMillis <= other.epochMillis;
  }

  equals(other: JstDateTime): boolean {
    return this.epochMillis === other.epochMillis;
  }

  /** "YYYY-MM-DDTHH:mm+09:00" 形式（JST）。 */
  toIsoJst(): string {
    const d = this.jstParts();
    const p = (n: number, w = 2) => String(n).padStart(w, "0");
    return (
      `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
      `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}+09:00`
    );
  }

  toString(): string {
    return this.toIsoJst();
  }
}
