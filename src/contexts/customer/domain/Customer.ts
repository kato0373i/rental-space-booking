import { CustomerId } from "../../../shared/domain/Id.js";
import { ContactInfo } from "./ContactInfo.js";
import type { Credential } from "./Credential.js";

export type CustomerType = "Member" | "Guest";

/**
 * 永続化用スナップショット（プリミティブのみ）。資格情報の secret は含めない
 * （資格情報は認証 Block(Cognito) が所有, ADR-AB07）。loginId は非PIIの識別子で検索用に保持する。
 */
export type CustomerSnapshot = {
  readonly id: string;
  readonly type: CustomerType;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly loginId: string | null;
};

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

  /**
   * 永続化スナップショットへ写像する（プロフィール＋非PIIの loginId のみ。secret は出さない, ADR-AB07）。
   */
  snapshot(): CustomerSnapshot {
    return {
      id: this.id,
      type: this.type,
      name: this.contact.name,
      email: this.contact.email,
      phone: this.contact.phone,
      loginId: this.credential?.loginId ?? null,
    };
  }

  /**
   * 永続化スナップショットから復元する（リポジトリ専用）。
   * 資格情報（secret）は認証 Block(Cognito) が所有するため復元しない（credential=null）。`type` は分類のため保持。
   * よって復元後の集約はプロフィール照会（連絡先）に用いる。認証はリポジトリ外（Cognito）で行う（ADR-AB07）。
   */
  static fromSnapshot(s: CustomerSnapshot): Customer {
    const contact = ContactInfo.of(s.name, s.email, s.phone);
    if (!contact.ok) {
      throw new Error(`顧客の復元に失敗しました(${s.id}): ${contact.error}`);
    }
    return new Customer(CustomerId.of(s.id), s.type, contact.value, null);
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
