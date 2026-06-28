import type { CustomerId } from "../../../../shared/domain/Id.js";

/**
 * 実メール宛先の解決ポート（通知コンテキストが所有・Customer が実装供給, 依存性逆転）。
 *
 * NFR-002 の設計上、`NotificationPort` のメッセージにはマスク済み PII しか載せない。
 * しかし SES 実送信には実アドレスが必要なため、SES アダプタが**送信直前にのみ**本ポートで
 * `CustomerId`（非PII の論理ID）から実アドレスを引く。生アドレスはアダプタ内部に留め、
 * ログ・booking 層・公開コードには一切出さない（PII 露出面を一点に閉じ込める, ADR-AB06）。
 */
export interface EmailRecipientResolver {
  /** 実メールアドレス。未登録なら undefined（送信はスキップする）。 */
  realEmailFor(customerId: CustomerId): Promise<string | undefined>;
}
