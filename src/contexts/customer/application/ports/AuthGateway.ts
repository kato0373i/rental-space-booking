import type { CustomerId } from "../../../../shared/domain/Id.js";
import type { Actor } from "../../../../shared/auth.js";
import type { Result } from "../../../../shared/domain/Result.js";
import type { ForbiddenError, ValidationError } from "../../../../shared/errors.js";

/** 会員登録時に認証基盤へ登録する資格情報（ADR-AB07）。 */
export type RegisterCredentialInput = {
  readonly loginId: string;
  readonly secret: string;
  /** ロール判定・属性付与に用いる（認証基盤側の属性へマッピング）。 */
  readonly email: string;
  /** プロフィール（CustomerRepository）と認証基盤を連結する論理ID（ADR-009/AB07）。 */
  readonly customerId: CustomerId;
  /** 付与するロール（Member/Admin）。シードの管理者登録で Admin を指定する（FR-042）。 */
  readonly role: "Member" | "Admin";
};

export type LoginInput = {
  readonly loginId: string;
  readonly secret: string;
};

/**
 * 認証ゲートウェイ（Customer アプリ層が所有, ADR-AB07）。
 * 資格情報・セッション・ロールの所有者を抽象化する。インメモリ実装（学習・テスト）と
 * Authentication Block(Cognito) 実装を同一ポート下で共存させ、`backend` で切り替える（ADR-AB03）。
 *
 * プロフィール/連絡先（PII）は {@link CustomerRepository} が所有し、本ポートは資格情報のみを扱う。
 * 両者は `customerId` で連結する。
 */
export interface AuthGateway {
  /**
   * 資格情報を登録する（会員登録の sign-up）。
   * ログインIDの重複など登録失敗は ValidationError。プロフィール保存より後に呼び、
   * 失敗時は呼び出し側がプロフィールを確定しないことで orphan を防ぐ（ADR-AB07）。
   */
  register(input: RegisterCredentialInput): Promise<Result<void, ValidationError>>;

  /**
   * 認証する（ログイン）。成功でロール付き Actor を返す。
   * 失敗は存在を秘匿して ForbiddenError（FR-040/042）。
   */
  authenticate(input: LoginInput): Promise<Result<Actor, ForbiddenError>>;
}
