import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { ValidationError } from "../../../shared/errors.js";
import { validationError } from "../../../shared/errors.js";
import { ContactInfo } from "../domain/ContactInfo.js";
import { Credential } from "../domain/Credential.js";
import { Customer } from "../domain/Customer.js";
import type { CustomerRepository } from "../domain/ports/CustomerRepository.js";

export type RegisterMemberInput = {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly loginId: string;
  readonly secret: string;
};

/** 会員登録（FR-040, モック認証）。ログインID・メールの重複は不可。 */
export class RegisterMember {
  constructor(private readonly customers: CustomerRepository) {}

  execute(input: RegisterMemberInput): Result<{ readonly customerId: string }, ValidationError> {
    const contact = ContactInfo.of(input.name, input.email, input.phone);
    if (!contact.ok) return err(validationError(contact.error));

    const credential = Credential.of(input.loginId, input.secret);
    if (!credential.ok) return err(validationError(credential.error));

    if (this.customers.byLoginId(input.loginId)) {
      return err(validationError("このログインIDは既に使用されています"));
    }
    if (this.customers.byEmail(contact.value.email)) {
      return err(validationError("このメールアドレスは既に登録されています"));
    }

    const member = Customer.registerMember(contact.value, credential.value);
    this.customers.save(member);
    return ok({ customerId: member.id });
  }
}
