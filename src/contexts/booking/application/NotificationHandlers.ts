import type { EventBus } from "../../../shared/domain/EventBus.js";
import type { CustomerId } from "../../../shared/domain/Id.js";
import {
  RESERVATION_CONFIRMED,
  type ReservationConfirmed,
} from "../domain/events/ReservationConfirmed.js";
import {
  RESERVATION_CANCELLED,
  type ReservationCancelled,
} from "../domain/events/ReservationCancelled.js";
import {
  RESERVATION_REMINDER_DUE,
  type ReservationReminderDue,
} from "../domain/events/ReservationReminderDue.js";
import type { CustomerDirectoryPort } from "./ports/CustomerDirectoryPort.js";
import type { NotificationPort } from "./ports/NotificationPort.js";

/**
 * ドメインイベントを購読して通知（モック）を送る（FR-030/031/032）。
 * Booking → Notification の単方向・結果整合。受信者・本文は PII マスク済みのみを渡す（NFR-002）。
 */
export class NotificationHandlers {
  constructor(
    private readonly notifier: NotificationPort,
    private readonly customers: CustomerDirectoryPort,
  ) {}

  register(bus: EventBus): void {
    bus.subscribe(RESERVATION_CONFIRMED, (e) => this.onConfirmed(e as ReservationConfirmed));
    bus.subscribe(RESERVATION_CANCELLED, (e) => this.onCancelled(e as ReservationCancelled));
    bus.subscribe(RESERVATION_REMINDER_DUE, (e) => this.onReminder(e as ReservationReminderDue));
  }

  private maskedRecipient(customerId: CustomerId): string {
    return this.customers.contactOf(customerId)?.maskedEmail ?? "***";
  }

  /**
   * 通知送信は外部 I/O（async）だが、ドメインイベント購読は結果整合のため fire-and-forget で呼ぶ
   * （EventBus は同期のまま。発火元トランザクションを送信遅延に結合させない, ADR-AB06）。
   * 送信失敗はマスク済み情報のみログに残す（NFR-002）。
   */
  private dispatch(message: Parameters<NotificationPort["send"]>[0]): void {
    void this.notifier.send(message).catch((err: unknown) => {
      console.error(
        `[通知:${message.kind}] 送信失敗 宛先=${message.maskedRecipient} 予約=${message.reservationNumber}`,
        err,
      );
    });
  }

  private onConfirmed(e: ReservationConfirmed): void {
    this.dispatch({
      kind: "Confirmed",
      recipientRef: e.customerId,
      maskedRecipient: this.maskedRecipient(e.customerId),
      reservationNumber: e.reservationNumber,
      body: `予約が確定しました。開始 ${e.startAt.toIsoJst()} / 金額 ${e.price.toString()}`,
    });
  }

  private onCancelled(e: ReservationCancelled): void {
    this.dispatch({
      kind: "Cancelled",
      recipientRef: e.customerId,
      maskedRecipient: this.maskedRecipient(e.customerId),
      reservationNumber: e.reservationNumber,
      body: `予約をキャンセルしました（${e.cancelledBy === "Admin" ? "管理者操作" : "ご本人操作"}）。キャンセル料 ${e.feeAmount.toString()} / 返金 ${e.refundAmount.toString()}`,
    });
  }

  private onReminder(e: ReservationReminderDue): void {
    this.dispatch({
      kind: "Reminder",
      recipientRef: e.customerId,
      maskedRecipient: this.maskedRecipient(e.customerId),
      reservationNumber: e.reservationNumber,
      body: `ご利用リマインド: 開始 ${e.startAt.toIsoJst()}`,
    });
  }
}
