import { sql } from "@aws-blocks/blocks";
import type { CustomerId } from "../../../shared/domain/Id.js";
import { Customer, type CustomerSnapshot, type CustomerType } from "../domain/Customer.js";
import type { CustomerRepository } from "../domain/ports/CustomerRepository.js";
import type { SqlDatabase } from "../../booking/infrastructure/BlocksReservationRepository.js";

type CustomerRow = {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly login_id: string | null;
};

const restore = (row: CustomerRow): Customer => {
  const snapshot: CustomerSnapshot = {
    id: row.id,
    type: row.type as CustomerType,
    name: row.name,
    email: row.email,
    phone: row.phone,
    loginId: row.login_id,
  };
  return Customer.fromSnapshot(snapshot);
};

/**
 * 顧客プロフィールの AWS Blocks Database 実装（§9#5）。
 * プロフィール/連絡先（PII）のみを永続化し、資格情報は認証 Block(Cognito) が所有する（ADR-AB07）。
 * ポート契約はインメモリ実装と同値（契約テストで担保）。
 */
export class BlocksCustomerRepository implements CustomerRepository {
  constructor(private readonly db: SqlDatabase) {}

  async save(customer: Customer): Promise<void> {
    const s = customer.snapshot();
    await this.db.execute(
      sql`INSERT INTO customers (id, type, name, email, phone, login_id)
          VALUES (${s.id}, ${s.type}, ${s.name}, ${s.email}, ${s.phone}, ${s.loginId})
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            login_id = EXCLUDED.login_id`,
    );
  }

  async byId(id: CustomerId): Promise<Customer | undefined> {
    const row = await this.db.queryOne<CustomerRow>(
      sql`SELECT id, type, name, email, phone, login_id FROM customers WHERE id = ${id}`,
    );
    return row ? restore(row) : undefined;
  }

  async byEmail(email: string): Promise<Customer | undefined> {
    const normalized = email.trim().toLowerCase();
    const row = await this.db.queryOne<CustomerRow>(
      sql`SELECT id, type, name, email, phone, login_id FROM customers WHERE email = ${normalized} LIMIT 1`,
    );
    return row ? restore(row) : undefined;
  }

  async byLoginId(loginId: string): Promise<Customer | undefined> {
    const row = await this.db.queryOne<CustomerRow>(
      sql`SELECT id, type, name, email, phone, login_id FROM customers WHERE login_id = ${loginId.trim()} LIMIT 1`,
    );
    return row ? restore(row) : undefined;
  }
}
