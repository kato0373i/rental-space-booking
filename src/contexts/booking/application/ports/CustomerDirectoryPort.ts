import type { CustomerId } from "../../../../shared/domain/Id.js";
import type { Result } from "../../../../shared/domain/Result.js";
import type { ValidationError } from "../../../../shared/errors.js";

export type GuestContactInput = {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
};

/** 通知・照会用の連絡先ビュー。マスク済み表現を含み、生 PII の利用を最小化する。 */
export type ContactView = {
  readonly maskedName: string;
  readonly maskedEmail: string;
};

/**
 * 顧客ディレクトリ照会ポート（Booking が所有・Customer が実装供給, ADR-008）。
 * ゲスト予約時はゲスト顧客を発行し CustomerId を返す。Booking→Customer の単方向 ID 参照。
 */
export interface CustomerDirectoryPort {
  resolveOrIssueGuest(contact: GuestContactInput): Result<CustomerId, ValidationError>;
  /** 通知用のマスク済み連絡先。 */
  contactOf(customerId: CustomerId): ContactView | undefined;
  /** 予約照会の照合（FR-016）。一致しなければ false（存在を推測させない判定に用いる）。 */
  emailMatches(customerId: CustomerId, email: string): boolean;
}
