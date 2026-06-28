import type { Actor } from "../../../shared/auth.js";
import { CustomerId } from "../../../shared/domain/Id.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { ForbiddenError, ValidationError } from "../../../shared/errors.js";
import { forbiddenError, validationError } from "../../../shared/errors.js";
import type {
  AuthGateway,
  LoginInput,
  RegisterCredentialInput,
} from "../application/ports/AuthGateway.js";
import type { CognitoAuthClient } from "./AuthCognitoClient.js";

/**
 * 認証ゲートウェイの Authentication Block(Cognito) 実装（ADR-AB07, ADR-AB03）。
 * 資格情報・セッション・ロールは Cognito が所有し、本クラスは {@link CognitoAuthClient} 越しに
 * 会員登録（sign-up）・ログイン（sign-in）を行い、結果を Customer アプリ層のポート契約へ写像する。
 *
 * プロフィール/連絡先（PII）は CustomerRepository が所有し、両者は `customerId` で連結する。
 */
export class CognitoAuthGateway implements AuthGateway {
  constructor(private readonly client: CognitoAuthClient) {}

  async register(input: RegisterCredentialInput): Promise<Result<void, ValidationError>> {
    const result = await this.client.signUp(input.loginId, input.secret, {
      email: input.email,
      role: input.role,
      customerId: input.customerId,
    });
    if (result.ok) return ok(undefined);

    switch (result.error.kind) {
      case "AlreadyExists":
        return err(validationError("このログインIDは既に使用されています"));
      case "InvalidPassword":
        return err(validationError("シークレットがパスワードポリシーを満たしていません"));
      default:
        return err(validationError("会員登録に失敗しました"));
    }
  }

  async authenticate(input: LoginInput): Promise<Result<Actor, ForbiddenError>> {
    const result = await this.client.signIn(input.loginId, input.secret);
    if (!result.ok) {
      // 不正・未登録・未確認はいずれも存在を秘匿して一律 Forbidden（FR-040/042）。
      return err(forbiddenError("ログインに失敗しました"));
    }
    return ok({ role: result.value.role, customerId: CustomerId.of(result.value.customerId) });
  }
}
