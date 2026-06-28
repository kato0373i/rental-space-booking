import { describe, expect, it } from "vitest";

import { CustomerId } from "../../../shared/domain/Id.js";
import { unwrap } from "../../../shared/domain/Result.js";
import { ContactInfo } from "../domain/ContactInfo.js";
import { Customer } from "../domain/Customer.js";
import { InMemoryCustomerRepository } from "../infrastructure/InMemoryCustomerRepository.js";
import { CustomerEmailResolver } from "./CustomerEmailResolver.js";

describe("CustomerEmailResolver（通知の宛先解決, #11）", () => {
  it("登録済み顧客の実メール（小文字化済み）を返す", async () => {
    const repo = new InMemoryCustomerRepository();
    const guest = Customer.issueGuest(unwrap(ContactInfo.of("山田太郎", "Guest@Example.com", "09012345678")));
    await repo.save(guest);

    const resolver = new CustomerEmailResolver(repo);
    expect(await resolver.realEmailFor(guest.id)).toBe("guest@example.com");
  });

  it("未登録 CustomerId は undefined（送信スキップの判断に使う）", async () => {
    const resolver = new CustomerEmailResolver(new InMemoryCustomerRepository());
    expect(await resolver.realEmailFor(CustomerId.of("missing"))).toBeUndefined();
  });
});
