import type { CustomerId } from "../../../shared/domain/Id.js";
import type { Customer } from "../domain/Customer.js";
import type { CustomerRepository } from "../domain/ports/CustomerRepository.js";

/** インメモリの顧客リポジトリ。 */
export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly store = new Map<string, Customer>();

  save(customer: Customer): void {
    this.store.set(customer.id, customer);
  }

  byId(id: CustomerId): Customer | undefined {
    return this.store.get(id);
  }

  byEmail(email: string): Customer | undefined {
    const normalized = email.trim().toLowerCase();
    for (const c of this.store.values()) {
      if (c.contact.email === normalized) return c;
    }
    return undefined;
  }

  byLoginId(loginId: string): Customer | undefined {
    for (const c of this.store.values()) {
      if (c.matchesLoginId(loginId)) return c;
    }
    return undefined;
  }
}
