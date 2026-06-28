import type { CustomerId } from "../../../../shared/domain/Id.js";
import type { Customer } from "../Customer.js";

/**
 * 顧客集約の永続化ポート。AWS Blocks 移行に伴い async 化（ADR-AB01/AB07）。
 * 顧客プロフィール/連絡先（PII）を所有する。資格情報・ロールは認証 Block（ADR-AB07）が所有する。
 */
export interface CustomerRepository {
  save(customer: Customer): Promise<void>;
  byId(id: CustomerId): Promise<Customer | undefined>;
  /** メールアドレス（小文字化済み）で検索。ゲスト顧客の再利用・会員ログインに用いる。 */
  byEmail(email: string): Promise<Customer | undefined>;
  byLoginId(loginId: string): Promise<Customer | undefined>;
}
