import { CustomerId } from "../../../shared/domain/Id.js";
import type { ContactInfo } from "./ContactInfo.js";
import type { Credential } from "./Credential.js";

export type CustomerType = "Member" | "Guest";

/**
 * 顧客集約ルート（支援サブドメイン）。会員（ログイン）と非会員（ゲスト）を統一して扱う（ADR-008）。
 * 全予約は CustomerId で束ねられ、ゲストも内部ゲスト顧客として発行される。
 *
 * 不変条件: ①Member は資格情報を持つ／Guest は持たない ②連絡先で予約照会・通知を照合する。
 */
export class Customer {
  private constructor(
    readonly id: CustomerId,
    readonly type: CustomerType,
    readonly contact: ContactInfo,
    private readonly credential: Credential | null,
  ) {}

  static registerMember(
    contact: ContactInfo,
    credential: Credential,
    id: CustomerId = CustomerId.generate(),
  ): Customer {
    return new Customer(id, "Member", contact, credential);
  }

  static issueGuest(
    contact: ContactInfo,
    id: CustomerId = CustomerId.generate(),
  ): Customer {
    return new Customer(id, "Guest", contact, null);
  }

  /** モック認証の照合（会員のみ）。 */
  authenticate(loginId: string, secret: string): boolean {
    return this.credential !== null && this.credential.matches(loginId, secret);
  }

  /** ログインIDの一致（secret 照合なし。リポジトリ検索用）。 */
  matchesLoginId(loginId: string): boolean {
    return this.credential !== null && this.credential.loginId === loginId.trim();
  }

  hasCredential(): boolean {
    return this.credential !== null;
  }
}
