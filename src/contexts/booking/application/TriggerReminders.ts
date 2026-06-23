import type { EventBus } from "../../../shared/domain/EventBus.js";
import type { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";
import {
  RESERVATION_REMINDER_DUE,
  type ReservationReminderDue,
} from "../domain/events/ReservationReminderDue.js";

/** リマインドのリードタイム（時間）。利用開始の24時間前に1回（U-03）。 */
const LEAD_HOURS = 24;

/**
 * 利用前リマインドのトリガ（FR-032）。デモではモック（手動トリガ）。
 * 基準時刻から LEAD_HOURS 以内に利用開始する Confirmed 予約にリマインドを送る。
 * confirmedStartingBetween は Confirmed のみ返すため、キャンセル済みには送られない。
 */
export class TriggerReminders {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly bus: EventBus,
  ) {}

  execute(input: { readonly referenceTime: JstDateTime }): { readonly sent: number } {
    const from = input.referenceTime;
    // [from, to) の半開区間。「ちょうど LEAD_HOURS 後」の開始を含めるため +1 分する。
    const to = input.referenceTime.addMinutes(LEAD_HOURS * 60 + 1);
    const due = this.reservations.confirmedStartingBetween(from, to);

    for (const reservation of due) {
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
    }

    return { sent: due.length };
  }
}
