import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";

/**
 * モック認証の資格情報 VO（FR-040）。会員のみ保持する。
 * デモのため実パスワードハッシュは扱わず、ログインID＋簡易シークレットで照合する（NFR-002）。
 */
export class Credential {
  private constructor(
    readonly loginId: string,
    private readonly secret: string,
  ) {}

  static of(loginId: string, secret: string): Result<Credential, string> {
    if (loginId.trim() === "") return err("ログインIDは必須です");
    if (secret.length < 4) return err("シークレットは4文字以上です");
    return ok(new Credential(loginId.trim(), secret));
  }

  /** モック認証の照合。 */
  matches(loginId: string, secret: string): boolean {
    return this.loginId === loginId.trim() && this.secret === secret;
  }
}
