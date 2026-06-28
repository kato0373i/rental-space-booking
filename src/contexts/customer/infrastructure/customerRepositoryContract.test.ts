import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Scope } from "@aws-blocks/core";
import { Database } from "@aws-blocks/blocks";
import { beforeEach, describe, expect, it } from "vitest";
import { CustomerId } from "../../../shared/domain/Id.js";
import { unwrap } from "../../../shared/domain/Result.js";
import { ContactInfo } from "../domain/ContactInfo.js";
import { Credential } from "../domain/Credential.js";
import { Customer } from "../domain/Customer.js";
import type { CustomerRepository } from "../domain/ports/CustomerRepository.js";
import { InMemoryCustomerRepository } from "./InMemoryCustomerRepository.js";
import { BlocksCustomerRepository } from "./BlocksCustomerRepository.js";
import type { SqlDatabase } from "../../booking/infrastructure/BlocksReservationRepository.js";

const migrationsPath = resolve(process.cwd(), "aws-blocks/migrations");

const contact = (name: string, email: string, phone = "090-0000-0000") =>
  unwrap(ContactInfo.of(name, email, phone));

const member = (loginId: string, email: string): Customer =>
  Customer.registerMember(contact("山田太郎", email), unwrap(Credential.of(loginId, "password")));

// インメモリ/Blocks 両実装に同一の契約をかける（ADR-AB05/AB07, §9#5）。
const backends: ReadonlyArray<{ name: string; make: () => CustomerRepository }> = [
  { name: "InMemory", make: () => new InMemoryCustomerRepository() },
  {
    name: "Blocks(PGlite)",
    make: () => {
      const db = new Database(new Scope(`test-${randomUUID()}`), "main", { migrationsPath });
      return new BlocksCustomerRepository(db as unknown as SqlDatabase);
    },
  },
];

describe.each(backends)("CustomerRepository 契約: $name", ({ make }) => {
  let repo: CustomerRepository;
  beforeEach(() => {
    repo = make();
  });

  it("会員を保存して id / メール / ログインID で読み戻せる（プロフィール保持）", async () => {
    const m = member("taro", "taro@example.com");
    await repo.save(m);

    const byId = await repo.byId(m.id);
    expect(byId?.id).toBe(m.id);
    expect(byId?.type).toBe("Member");
    expect(byId?.contact.email).toBe("taro@example.com");

    expect((await repo.byEmail("Taro@Example.com"))?.id).toBe(m.id); // 大文字でも一致（小文字化）
    expect((await repo.byLoginId("taro"))?.id).toBe(m.id);
  });

  it("ゲストを保存して id / メールで読み戻せる（loginId なし）", async () => {
    const g = Customer.issueGuest(contact("佐藤花子", "hanako@example.com"));
    await repo.save(g);

    expect((await repo.byId(g.id))?.type).toBe("Guest");
    expect((await repo.byEmail("hanako@example.com"))?.id).toBe(g.id);
    expect(await repo.byLoginId("hanako@example.com")).toBeUndefined();
  });

  it("未登録は undefined（id / メール / ログインID）", async () => {
    expect(await repo.byId(CustomerId.of("missing"))).toBeUndefined();
    expect(await repo.byEmail("none@example.com")).toBeUndefined();
    expect(await repo.byLoginId("none")).toBeUndefined();
  });

  it("同一 id の保存は上書き（プロフィール更新）", async () => {
    const m = member("taro", "taro@example.com");
    await repo.save(m);
    const updated = Customer.registerMember(
      contact("山田太郎", "taro@example.com", "080-9999-9999"),
      unwrap(Credential.of("taro", "password")),
      m.id,
    );
    await repo.save(updated);

    expect((await repo.byId(m.id))?.contact.phone).toBe("080-9999-9999");
  });
});
