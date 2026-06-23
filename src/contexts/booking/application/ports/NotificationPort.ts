export type NotificationKind = "Confirmed" | "Cancelled" | "Reminder";

/**
 * 通知メッセージ。PII はマスク済みの文字列のみを含む（NFR-002）。
 * 受信者の生メール・氏名はここに渡さない。
 */
export type NotificationMessage = {
  readonly kind: NotificationKind;
  readonly maskedRecipient: string;
  readonly reservationNumber: string;
  readonly body: string;
};

/**
 * 通知ポート（Booking が所有, ADR-001）。実装はモックアダプタ（コンソール出力）。
 * ドメインイベント購読側がマスク済みメッセージを組み立てて送る。
 */
export interface NotificationPort {
  send(message: NotificationMessage): void;
}
