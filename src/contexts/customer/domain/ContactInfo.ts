import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 連絡先 VO（氏名/メール/電話）。個人情報（PII）。
 * NFR-002: ログ・通知本文に平文出力しない。表示用は masked*() を用いる。
 */
export class ContactInfo {
  private constructor(
    readonly name: string,
    readonly email: string,
    readonly phone: string,
  ) {}

  static of(name: string, email: string, phone: string): Result<ContactInfo, string> {
    if (name.trim() === "") return err("氏名は必須です");
    if (!EMAIL_RE.test(email)) return err(`メールアドレスの形式が不正です: ${email}`);
    if (phone.trim() === "") return err("電話番号は必須です");
    return ok(new ContactInfo(name.trim(), email.trim().toLowerCase(), phone.trim()));
  }

  /** 照会キー照合用。大文字小文字を無視して等価判定（FR-016）。 */
  emailEquals(other: string): boolean {
    return this.email === other.trim().toLowerCase();
  }

  /** 通知本文用のマスク済みメール（例: t***@example.com）。 */
  maskedEmail(): string {
    const [local, domain] = this.email.split("@");
    if (!local || !domain) return "***";
    const head = local.slice(0, 1);
    return `${head}***@${domain}`;
  }

  /** 通知・ログ用のマスク済み氏名（例: 山***）。 */
  maskedName(): string {
    return `${this.name.slice(0, 1)}***`;
  }
}
