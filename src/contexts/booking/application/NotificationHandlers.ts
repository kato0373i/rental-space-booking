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
    // ハンドラは Promise を返し、非同期実行・失敗時リトライ/DLQ は EventBus 実装に委ねる（ADR-AB09）。
    // インメモリ実装では fire-and-forget、Blocks 実装では Background jobs のワーカーで実行される。
    bus.subscribe(RESERVATION_CONFIRMED, (e) => this.onConfirmed(e as ReservationConfirmed));
    bus.subscribe(RESERVATION_CANCELLED, (e) => this.onCancelled(e as ReservationCancelled));
    bus.subscribe(RESERVATION_REMINDER_DUE, (e) => this.onReminder(e as ReservationReminderDue));
  }

  private async maskedRecipient(customerId: CustomerId): Promise<string> {
    return (await this.customers.contactOf(customerId))?.maskedEmail ?? "***";
  }

  /**
   * 通知を送信する。例外は握りつぶさず呼び出し元（EventBus）へ伝播させ、リトライ/DLQ の判断に委ねる
   * （ADR-AB09）。生 PII は載せない（NFR-002, 宛先解決は SES アダプタ内に閉じる, ADR-AB06）。
   */
  private send(message: Parameters<NotificationPort["send"]>[0]): Promise<void> {
    return this.notifier.send(message);
  }

  private async onConfirmed(e: ReservationConfirmed): Promise<void> {
    await this.send({
      kind: "Confirmed",
      recipientRef: e.customerId,
      maskedRecipient: await this.maskedRecipient(e.customerId),
      reservationNumber: e.reservationNumber,
      body: `予約が確定しました。開始 ${e.startAt.toIsoJst()} / 金額 ${e.price.toString()}`,
    });
  }

  private async onCancelled(e: ReservationCancelled): Promise<void> {
    await this.send({
      kind: "Cancelled",
      recipientRef: e.customerId,
      maskedRecipient: await this.maskedRecipient(e.customerId),
      reservationNumber: e.reservationNumber,
      body: `予約をキャンセルしました（${e.cancelledBy === "Admin" ? "管理者操作" : "ご本人操作"}）。キャンセル料 ${e.feeAmount.toString()} / 返金 ${e.refundAmount.toString()}`,
    });
  }

  private async onReminder(e: ReservationReminderDue): Promise<void> {
    await this.send({
      kind: "Reminder",
      recipientRef: e.customerId,
      maskedRecipient: await this.maskedRecipient(e.customerId),
      reservationNumber: e.reservationNumber,
      body: `ご利用リマインド: 開始 ${e.startAt.toIsoJst()}`,
    });
  }
}
