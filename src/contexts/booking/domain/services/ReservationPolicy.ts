import type { JstDateTime } from "../../../../shared/domain/JstDateTime.js";
import type { Result } from "../../../../shared/domain/Result.js";
import { err, ok } from "../../../../shared/domain/Result.js";
import type { ValidationError } from "../../../../shared/errors.js";
import { validationError } from "../../../../shared/errors.js";
import type { SlottedPeriod } from "../SlottedPeriod.js";

/**
 * 予約成立の不変条件（ドメイン側の表現）。アプリ層が SpaceCatalogPort の DTO から写像して渡す。
 * ドメインサービスがアプリ層を import しないための境界型。
 */
export type BookingConstraints = {
  readonly isPublished: boolean;
  readonly openMinuteOfDay: number;
  readonly closeMinuteOfDay: number;
  readonly slotMinutes: number;
  readonly minSlots: number;
  readonly maxSlots: number;
  readonly bookableHorizonDays: number;
};

/**
 * 予約ルール検証ドメインサービス（FR-014）。純粋・副作用なし（ADR-007）。
 * ①連続性（SlottedPeriod 構築で保証） ②min/max ③営業時間内・公開中 ④過去日時不可・予約可能上限以内。
 */
export const ReservationPolicy = {
  validate(
    period: SlottedPeriod,
    c: BookingConstraints,
    now: JstDateTime,
  ): Result<void, ValidationError> {
    const details: string[] = [];

    // ③公開中スペースのみ受付（FR-003）
    if (!c.isPublished) {
      return err(validationError("現在予約を受け付けていません", ["スペースが公開停止中です"]));
    }

    // ②min/max スロット数（FR-014）
    const count = period.count();
    if (count < c.minSlots) {
      details.push(`最小${c.minSlots}スロットからの予約です`);
    }
    if (count > c.maxSlots) {
      details.push(`最大${c.maxSlots}スロットまでの予約です`);
    }

    // ③各スロットが営業時間内（FR-004/014）
    for (const slot of period.slotStarts()) {
      const startMin = slot.minuteOfDayJst();
      if (startMin < c.openMinuteOfDay || startMin + c.slotMinutes > c.closeMinuteOfDay) {
        details.push(`営業時間外のスロットが含まれています: ${slot.toIsoJst()}`);
        break;
      }
    }

    // ④過去日時不可（FR-014）
    if (period.start().isBefore(now)) {
      details.push("過去の時間帯は予約できません");
    }

    // ④予約可能上限以内（FR-014）
    const hoursAhead = period.start().hoursSince(now);
    if (hoursAhead > c.bookableHorizonDays * 24) {
      details.push(`予約可能期間（${c.bookableHorizonDays}日先まで）を超えています`);
    }

    return details.length === 0
      ? ok(undefined)
      : err(validationError("予約ルールに違反しています", details));
  },
};
