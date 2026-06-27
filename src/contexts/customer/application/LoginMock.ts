import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { Actor, Role } from "../../../shared/auth.js";
import type { ForbiddenError } from "../../../shared/errors.js";
import { forbiddenError } from "../../../shared/errors.js";
import type { CustomerRepository } from "../domain/ports/CustomerRepository.js";

export type LoginInput = {
  readonly loginId: string;
  readonly secret: string;
};

/**
 * モックログイン（FR-040/042）。成功でアクターを返す。失敗は存在を秘匿して Forbidden。
 * 認証済み顧客の loginId が adminLoginIds に含まれる場合は Admin ロールを付与する（B-1）。
 */
export class LoginMock {
  constructor(
    private readonly customers: CustomerRepository,
    /** 管理者として扱う loginId 集合（合成ルートが供給。シードで登録, FR-042）。 */
    private readonly adminLoginIds: ReadonlySet<string> = new Set(),
  ) {}

  execute(input: LoginInput): Result<Actor, ForbiddenError> {
    const customer = this.customers.byLoginId(input.loginId);
    if (!customer || !customer.authenticate(input.loginId, input.secret)) {
      return err(forbiddenError("ログインに失敗しました"));
    }
    const role: Role = this.adminLoginIds.has(input.loginId.trim()) ? "Admin" : "Member";
    return ok({ role, customerId: customer.id });
  }
}
