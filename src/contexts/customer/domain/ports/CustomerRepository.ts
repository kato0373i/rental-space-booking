import type { CustomerId } from "../../../../shared/domain/Id.js";
import type { Customer } from "../Customer.js";

/** 顧客集約の永続化ポート。 */
export interface CustomerRepository {
  save(customer: Customer): void;
  byId(id: CustomerId): Customer | undefined;
  /** メールアドレス（小文字化済み）で検索。ゲスト顧客の再利用・会員ログインに用いる。 */
  byEmail(email: string): Customer | undefined;
  byLoginId(loginId: string): Customer | undefined;
}
