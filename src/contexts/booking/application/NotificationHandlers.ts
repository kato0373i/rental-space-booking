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

  private onConfirmed(e: ReservationConfirmed): void {
    this.notifier.send({
      kind: "Confirmed",
      maskedRecipient: this.maskedRecipient(e.customerId),
      reservationNumber: e.reservationNumber,
      body: `予約が確定しました。開始 ${e.startAt.toIsoJst()} / 金額 ${e.price.toString()}`,
    });
  }

  private onCancelled(e: ReservationCancelled): void {
    this.notifier.send({
      kind: "Cancelled",
      maskedRecipient: this.maskedRecipient(e.customerId),
      reservationNumber: e.reservationNumber,
      body: `予約をキャンセルしました（${e.cancelledBy === "Admin" ? "管理者操作" : "ご本人操作"}）。キャンセル料 ${e.feeAmount.toString()} / 返金 ${e.refundAmount.toString()}`,
    });
  }

  private onReminder(e: ReservationReminderDue): void {
    this.notifier.send({
      kind: "Reminder",
      maskedRecipient: this.maskedRecipient(e.customerId),
      reservationNumber: e.reservationNumber,
      body: `ご利用リマインド: 開始 ${e.startAt.toIsoJst()}`,
    });
  }
}
