import { isBlocksError, type BlocksContext } from "@aws-blocks/core";
import { AuthCognito, AuthCognitoErrors } from "@aws-blocks/blocks";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";

/** sign-up 時に認証基盤へ載せる属性（`custom:*` は基盤側プレフィックスで保存される）。 */
export type SignUpAttributes = {
  readonly email: string;
  readonly role: "Member" | "Admin";
  readonly customerId: string;
};

/** sign-in 成功時に基盤から読み出すユーザー情報。 */
export type AuthenticatedUser = {
  readonly role: "Member" | "Admin";
  readonly customerId: string;
};

/** クライアント層の失敗種別（ドメインエラーへの写像は {@link CognitoAuthGateway} が担う）。 */
export type AuthClientError =
  | { readonly kind: "AlreadyExists"; readonly message: string }
  | { readonly kind: "InvalidPassword"; readonly message: string }
  | { readonly kind: "NotAuthorized"; readonly message: string }
  | { readonly kind: "Unknown"; readonly message: string };

/**
 * 認証基盤への最小トランスポート面（ADR-AB07）。Scope 依存の具体（`AuthCognito`）に結合せず、
 * テストでは fake を注入できる（SES アダプタの `EmailSender` と同方針）。
 * セッション Cookie/Context・確認コードの往復はこの実装内部に閉じ込め、上位には公開しない。
 */
export interface CognitoAuthClient {
  /** 会員登録（確認まで完了させる）。重複・パスワードポリシー違反は err。 */
  signUp(
    loginId: string,
    secret: string,
    attrs: SignUpAttributes,
  ): Promise<Result<void, AuthClientError>>;
  /** ログイン。成功でロール+顧客IDを返す。資格情報不正は err。 */
  signIn(loginId: string, secret: string): Promise<Result<AuthenticatedUser, AuthClientError>>;
}

/**
 * 認証基盤呼び出しの Cookie/Context（モックでもブラウザ往復を模す最小形）。
 * 本アダプタはステートレスな login のみを行い Cookie を読み書きしないため、`headers` だけを満たす
 * 最小コンテキストを構築する（`BlocksContext` の body/json/url 等は未使用）。
 */
const newContext = (): BlocksContext =>
  ({
    request: { headers: new Headers() },
    response: { headers: new Headers() },
  }) as unknown as BlocksContext;

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Authentication Block(Cognito) を用いた {@link CognitoAuthClient} の実装（ADR-AB07）。
 * ローカルは Cognito Block のモック（実 AWS 不要・外部 I/O なし）として動作する。
 *
 * ロール/顧客IDは `custom:role` / `custom:customer_id` 属性で保持し、sign-in 後に読み戻す。
 * 学習用シード（弱い secret）に合わせ、パスワードポリシーは緩め・MFA オフで構成する。
 */
export class AuthCognitoClient implements CognitoAuthClient {
  private readonly auth: AuthCognito;
  /** モックが配信した最新の確認コード（sign-up 確認に用いる。テスト足場相当）。 */
  private lastCode = "";

  constructor(scope: ConstructorParameters<typeof AuthCognito>[0], id = "auth") {
    this.auth = new AuthCognito(scope, id, {
      mfa: "off",
      // 学習用シードの secret（"password" 等）を通すための緩いポリシー。本番では強化する。
      passwordPolicy: {
        minLength: 4,
        requireUppercase: false,
        requireLowercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      userAttributes: [
        { name: "role", mutable: true },
        { name: "customer_id", mutable: false },
      ],
      codeDelivery: async (_username, code) => {
        this.lastCode = code;
      },
    });
  }

  async signUp(
    loginId: string,
    secret: string,
    attrs: SignUpAttributes,
  ): Promise<Result<void, AuthClientError>> {
    try {
      const result = await this.auth.signUp(loginId, secret, {
        attributes: {
          email: attrs.email,
          "custom:role": attrs.role,
          "custom:customer_id": attrs.customerId,
        },
      });
      // 構成によっては確認コードが要求される。モック配信コードで即時確認する。
      if (!result.isSignUpComplete && result.nextStep?.name === "CONFIRM_SIGN_UP") {
        await this.auth.confirmSignUp(loginId, this.lastCode);
      }
      return ok(undefined);
    } catch (e) {
      if (isBlocksError(e, AuthCognitoErrors.UserAlreadyExists)) {
        return err({ kind: "AlreadyExists", message: messageOf(e) });
      }
      if (isBlocksError(e, AuthCognitoErrors.InvalidPassword)) {
        return err({ kind: "InvalidPassword", message: messageOf(e) });
      }
      return err({ kind: "Unknown", message: messageOf(e) });
    }
  }

  async signIn(loginId: string, secret: string): Promise<Result<AuthenticatedUser, AuthClientError>> {
    try {
      const result = await this.auth.signIn(loginId, secret, newContext());
      if (result.status !== "signedIn") {
        // MFA 等の追加チャレンジは本構成では発生しない想定。発生したら認証失敗として扱う。
        return err({ kind: "NotAuthorized", message: "追加の認証ステップが必要です" });
      }
      const attrs = result.user.attributes;
      const role = attrs["custom:role"] === "Admin" ? "Admin" : "Member";
      const customerId = attrs["custom:customer_id"] ?? "";
      return ok({ role, customerId });
    } catch (e) {
      if (
        isBlocksError(e, AuthCognitoErrors.NotAuthorized) ||
        isBlocksError(e, AuthCognitoErrors.UserNotFound) ||
        isBlocksError(e, AuthCognitoErrors.UserNotConfirmed)
      ) {
        return err({ kind: "NotAuthorized", message: messageOf(e) });
      }
      return err({ kind: "Unknown", message: messageOf(e) });
    }
  }
}
