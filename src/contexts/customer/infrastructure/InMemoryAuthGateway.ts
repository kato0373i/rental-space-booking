import type { Actor } from "../../../shared/auth.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { ForbiddenError, ValidationError } from "../../../shared/errors.js";
import { forbiddenError, validationError } from "../../../shared/errors.js";
import type {
  AuthGateway,
  LoginInput,
  RegisterCredentialInput,
} from "../application/ports/AuthGateway.js";
import type { CustomerRepository } from "../domain/ports/CustomerRepository.js";

/**
 * 認証ゲートウェイのインメモリ（モック）実装（ADR-AB07, ADR-AB03）。学習・テスト・デモ用に共存。
 *
 * 秘密情報の照合は既存ドメイン（`Customer.authenticate` / `Credential`）をそのまま利用し（NFR-003/005,
 * ドメイン無変更）、ロール（Member/Admin）だけを loginId 単位で本ゲートウェイが保持する。
 * これにより認証 Block(Cognito) 実装と同じポート契約を満たす。
 */
export class InMemoryAuthGateway implements AuthGateway {
  /** loginId(trim) → ロール。register 時に確定する（Cognito の `custom:role` 属性に相当）。 */
  private readonly roles = new Map<string, "Member" | "Admin">();

  constructor(private readonly customers: CustomerRepository) {}

  async register(input: RegisterCredentialInput): Promise<Result<void, ValidationError>> {
    const key = input.loginId.trim();
    if (this.roles.has(key)) {
      return err(validationError("このログインIDは既に使用されています"));
    }
    this.roles.set(key, input.role);
    return ok(undefined);
  }

  async authenticate(input: LoginInput): Promise<Result<Actor, ForbiddenError>> {
    const customer = await this.customers.byLoginId(input.loginId);
    if (!customer || !customer.authenticate(input.loginId, input.secret)) {
      // 存在を秘匿して一律 Forbidden（FR-040/042）。
      return err(forbiddenError("ログインに失敗しました"));
    }
    const role = this.roles.get(input.loginId.trim()) ?? "Member";
    return ok({ role, customerId: customer.id });
  }
}
