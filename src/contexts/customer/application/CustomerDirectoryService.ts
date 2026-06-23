import type { CustomerId } from "../../../shared/domain/Id.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { ValidationError } from "../../../shared/errors.js";
import { validationError } from "../../../shared/errors.js";
import type {
  ContactView,
  CustomerDirectoryPort,
  GuestContactInput,
} from "../../booking/application/ports/CustomerDirectoryPort.js";
import { Customer } from "../domain/Customer.js";
import { ContactInfo } from "../domain/ContactInfo.js";
import type { CustomerRepository } from "../domain/ports/CustomerRepository.js";

/**
 * Booking の CustomerDirectoryPort を Customer コンテキストが実装供給する（ADR-008）。
 * ゲスト予約時はゲスト顧客を発行（同一メールは既存顧客を再利用）し CustomerId を返す。
 */
export class CustomerDirectoryService implements CustomerDirectoryPort {
  constructor(private readonly customers: CustomerRepository) {}

  resolveOrIssueGuest(contact: GuestContactInput): Result<CustomerId, ValidationError> {
    const info = ContactInfo.of(contact.name, contact.email, contact.phone);
    if (!info.ok) return err(validationError(info.error));

    const existing = this.customers.byEmail(info.value.email);
    if (existing) return ok(existing.id);

    const guest = Customer.issueGuest(info.value);
    this.customers.save(guest);
    return ok(guest.id);
  }

  contactOf(customerId: CustomerId): ContactView | undefined {
    const customer = this.customers.byId(customerId);
    if (!customer) return undefined;
    return {
      maskedName: customer.contact.maskedName(),
      maskedEmail: customer.contact.maskedEmail(),
    };
  }

  emailMatches(customerId: CustomerId, email: string): boolean {
    const customer = this.customers.byId(customerId);
    return customer ? customer.contact.emailEquals(email) : false;
  }
}
