import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { ValidationError } from "../../../shared/errors.js";
import { validationError } from "../../../shared/errors.js";
import { ContactInfo } from "../domain/ContactInfo.js";
import { Credential } from "../domain/Credential.js";
import { Customer } from "../domain/Customer.js";
import type { CustomerRepository } from "../domain/ports/CustomerRepository.js";
import type { AuthGateway } from "./ports/AuthGateway.js";

export type RegisterMemberInput = {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly loginId: string;
  readonly secret: string;
  /** 付与ロール（既定 Member）。シードの管理者登録で Admin を指定する（FR-042）。 */
  readonly role?: "Member" | "Admin";
};

/**
 * 会員登録（FR-040/042）。プロフィール（連絡先）は CustomerRepository、資格情報・ロールは
 * 認証 Block({@link AuthGateway}) が所有する（ADR-AB07）。メール重複はプロフィール側、
 * ログインID重複は認証基盤側で検出する。
 */
export class RegisterMember {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly auth: AuthGateway,
  ) {}

  async execute(
    input: RegisterMemberInput,
  ): Promise<Result<{ readonly customerId: string }, ValidationError>> {
    const contact = ContactInfo.of(input.name, input.email, input.phone);
    if (!contact.ok) return err(validationError(contact.error));

    const credential = Credential.of(input.loginId, input.secret);
    if (!credential.ok) return err(validationError(credential.error));

    if (await this.customers.byEmail(contact.value.email)) {
      return err(validationError("このメールアドレスは既に登録されています"));
    }

    // プロフィールを先に組み立て、認証基盤の sign-up 成功後にのみ保存する（失敗時の orphan 防止, ADR-AB07）。
    const member = Customer.registerMember(contact.value, credential.value);
    const registered = await this.auth.register({
      loginId: input.loginId,
      secret: input.secret,
      email: contact.value.email,
      customerId: member.id,
      role: input.role ?? "Member",
    });
    if (!registered.ok) return registered;

    await this.customers.save(member);
    return ok({ customerId: member.id });
  }
}
