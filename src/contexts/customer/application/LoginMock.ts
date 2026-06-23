import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { Actor } from "../../../shared/auth.js";
import type { ForbiddenError } from "../../../shared/errors.js";
import { forbiddenError } from "../../../shared/errors.js";
import type { CustomerRepository } from "../domain/ports/CustomerRepository.js";

export type LoginInput = {
  readonly loginId: string;
  readonly secret: string;
};

/** モックログイン（FR-040）。成功で会員ロールのアクターを返す。失敗は存在を秘匿して Forbidden。 */
export class LoginMock {
  constructor(private readonly customers: CustomerRepository) {}

  execute(input: LoginInput): Result<Actor, ForbiddenError> {
    const customer = this.customers.byLoginId(input.loginId);
    if (!customer || !customer.authenticate(input.loginId, input.secret)) {
      return err(forbiddenError("ログインに失敗しました"));
    }
    return ok({ role: "Member", customerId: customer.id });
  }
}
