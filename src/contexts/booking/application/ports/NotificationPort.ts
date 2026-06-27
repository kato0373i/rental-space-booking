import type { CustomerId } from "../../../../shared/domain/Id.js";

export type NotificationKind = "Confirmed" | "Cancelled" | "Reminder";

/**
 * 通知メッセージ。表示・ログに使う文字列は PII マスク済みのみを含む（NFR-002）。
 * 実送信（SES）に必要な宛先は本メッセージには載せず、`recipientRef`（顧客の論理ID, 非PII）
 * から実装アダプタが送信直前に解決する（ADR-AB06）。受信者の生メール・氏名はここに渡さない。
 */
export type NotificationMessage = {
  readonly kind: NotificationKind;
  /** 実宛先の解決キー（CustomerId, ADR-009 の論理ID）。生 PII ではない。 */
  readonly recipientRef: CustomerId;
  readonly maskedRecipient: string;
  readonly reservationNumber: string;
  readonly body: string;
};

/**
 * 通知ポート（Booking が所有, ADR-001）。実装はモック（コンソール）/ SES(Email Block, #11)。
 * ドメインイベント購読側がマスク済みメッセージを組み立てて送る。
 * 送信は外部 I/O のため async（Promise）。購読側は結果整合のため fire-and-forget で呼ぶ（ADR-AB06）。
 */
export interface NotificationPort {
  send(message: NotificationMessage): Promise<void>;
}
