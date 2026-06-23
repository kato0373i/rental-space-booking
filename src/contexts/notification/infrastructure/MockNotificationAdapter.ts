import type {
  NotificationMessage,
  NotificationPort,
} from "../../booking/application/ports/NotificationPort.js";

/**
 * 通知モックアダプタ（FR-030/031/032, NFR-004）。コンソール出力で確認可能。
 * 受け取るメッセージは PII マスク済みのみ。アプリログに平文 PII を残さない（NFR-002）。
 */
export class MockNotificationAdapter implements NotificationPort {
  private readonly messages: NotificationMessage[] = [];

  constructor(private readonly log = true) {}

  send(message: NotificationMessage): void {
    this.messages.push(message);
    if (this.log) {
      // 出力にも生 PII は含めない（maskedRecipient / マスク済み body のみ）。
      console.info(
        `[通知:${message.kind}] 宛先=${message.maskedRecipient} 予約=${message.reservationNumber} ${message.body}`,
      );
    }
  }

  /** 送信済みメッセージ（テスト・確認用）。 */
  sent(): readonly NotificationMessage[] {
    return this.messages;
  }

  sentOfKind(kind: NotificationMessage["kind"]): NotificationMessage[] {
    return this.messages.filter((m) => m.kind === kind);
  }

  clear(): void {
    this.messages.length = 0;
  }
}
