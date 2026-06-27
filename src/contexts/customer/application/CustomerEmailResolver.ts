import type { CustomerId } from "../../../shared/domain/Id.js";
import type { EmailRecipientResolver } from "../../notification/application/ports/EmailRecipientResolver.js";
import type { CustomerRepository } from "../domain/ports/CustomerRepository.js";

/**
 * 通知コンテキストの {@link EmailRecipientResolver} を Customer が実装供給する（ADR-008 と同様の供給）。
 * 生メールを保持するのは Customer コンテキストのみ。本クラスは「送信のための宛先解決」という
 * 単一目的に限って実アドレスを返す（NFR-002 の PII 露出面の最小化）。
 */
export class CustomerEmailResolver implements EmailRecipientResolver {
  constructor(private readonly customers: CustomerRepository) {}

  realEmailFor(customerId: CustomerId): string | undefined {
    return this.customers.byId(customerId)?.contact.email;
  }
}
