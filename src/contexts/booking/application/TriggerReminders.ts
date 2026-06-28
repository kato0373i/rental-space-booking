import type { EventBus } from "../../../shared/domain/EventBus.js";
import type { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";
import type { ReminderLog } from "./ports/ReminderLog.js";
import {
  RESERVATION_REMINDER_DUE,
  type ReservationReminderDue,
} from "../domain/events/ReservationReminderDue.js";

/** リマインドのリードタイム（時間）。利用開始の24時間前に1回（U-03）。 */
const LEAD_HOURS = 24;

/**
 * 利用前リマインドのトリガ（FR-032 / U-03）。Scheduled tasks Block（cron）が定期起動する（#12）。
 * 基準時刻から LEAD_HOURS 以内に利用開始する Confirmed 予約にリマインドを送る。
 * confirmedStartingBetween は Confirmed のみ返すため、キャンセル済みには送られない。
 *
 * cron は短間隔で繰り返し起動し同一予約が窓に滞在し続けるため、{@link ReminderLog} で
 * 「初回のみ送る」主張をアトミックに行い二重送信を防ぐ（冪等。手動トリガでも同様に効く）。
 */
export class TriggerReminders {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly bus: EventBus,
    private readonly reminderLog: ReminderLog,
  ) {}

  async execute(input: { readonly referenceTime: JstDateTime }): Promise<{ readonly sent: number }> {
    const from = input.referenceTime;
    // [from, to) の半開区間。「ちょうど LEAD_HOURS 後」の開始を含めるため +1 分する。
    const to = input.referenceTime.addMinutes(LEAD_HOURS * 60 + 1);
    const due = await this.reservations.confirmedStartingBetween(from, to);

    let sent = 0;
    for (const reservation of due) {
      // 既送信の予約はスキップ（cron の反復起動・at-least-once 配信に対する冪等性, #12）。
      if (!(await this.reminderLog.markIfFirst(reservation.id))) continue;

      const event: ReservationReminderDue = {
        type: RESERVATION_REMINDER_DUE,
        occurredAt: input.referenceTime,
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber.value,
        customerId: reservation.customerId,
        spaceId: reservation.spaceId,
        startAt: reservation.period.start(),
      };
      this.bus.publish(event);
      sent += 1;
    }

    return { sent };
  }
}
