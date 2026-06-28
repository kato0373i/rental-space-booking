import type { CustomerId } from "../../../shared/domain/Id.js";
import type { Customer } from "../domain/Customer.js";
import type { CustomerRepository } from "../domain/ports/CustomerRepository.js";

/**
 * インメモリの顧客リポジトリ。async ポート（ADR-AB01）をインメモリで満たす。
 * JS 単一スレッドのため各メソッド内に `await` を挟まなければアトミック性は維持される。
 */
export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly store = new Map<string, Customer>();

  async save(customer: Customer): Promise<void> {
    this.store.set(customer.id, customer);
  }

  async byId(id: CustomerId): Promise<Customer | undefined> {
    return this.store.get(id);
  }

  async byEmail(email: string): Promise<Customer | undefined> {
    const normalized = email.trim().toLowerCase();
    for (const c of this.store.values()) {
      if (c.contact.email === normalized) return c;
    }
    return undefined;
  }

  async byLoginId(loginId: string): Promise<Customer | undefined> {
    for (const c of this.store.values()) {
      if (c.matchesLoginId(loginId)) return c;
    }
    return undefined;
  }
}
