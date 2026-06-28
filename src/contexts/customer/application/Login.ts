import type { Result } from "../../../shared/domain/Result.js";
import type { Actor } from "../../../shared/auth.js";
import type { ForbiddenError } from "../../../shared/errors.js";
import type { AuthGateway, LoginInput } from "./ports/AuthGateway.js";

export type { LoginInput };

/**
 * ログイン（FR-040/042）。認証 Block({@link AuthGateway}) に委譲し、成功でロール付き Actor を返す。
 * 失敗は存在を秘匿して Forbidden。ロール（Member/Admin）の解決は認証基盤が担う（ADR-AB07）。
 */
export class Login {
  constructor(private readonly auth: AuthGateway) {}

  execute(input: LoginInput): Promise<Result<Actor, ForbiddenError>> {
    return this.auth.authenticate(input);
  }
}
