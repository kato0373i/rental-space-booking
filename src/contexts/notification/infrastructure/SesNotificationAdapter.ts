import { isBlocksError } from "@aws-blocks/core";
import { EmailErrors, type EmailMessage, type SendResult } from "@aws-blocks/blocks";

import type {
  NotificationKind,
  NotificationMessage,
  NotificationPort,
} from "../../booking/application/ports/NotificationPort.js";
import type { EmailRecipientResolver } from "../application/ports/EmailRecipientResolver.js";

/**
 * SES 送信面の最小インターフェース（Email Block の `EmailClient` が満たす）。
 * 具体 `EmailClient`（Scope 依存）に結合せず、テストでは fake を渡して宛先/件名を検証できる。
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<SendResult>;
}

const SUBJECTS: Record<NotificationKind, string> = {
  Confirmed: "【レンタルスペース】ご予約が確定しました",
  Cancelled: "【レンタルスペース】ご予約をキャンセルしました",
  Reminder: "【レンタルスペース】ご利用予約のリマインド",
};

/**
 * 通知ポートの AWS Blocks（Email Block / SES）実装（Issue #11）。
 * ローカル開発では Email Block がモック（実送信なし・AWSアカウント不要）として動くため、
 * 公開リポジトリでも実アドレスへ外部送信されない。
 *
 * PII（NFR-002）: 実宛先は {@link EmailRecipientResolver} で送信直前に解決し、SES の `to` に
 * 渡すためだけに用いる。例外メッセージに生アドレスが含まれ得るため、ログにはマスク済み情報のみを残し、
 * 生 PII を含む生エラーは外へ伝播させない。
 */
export class SesNotificationAdapter implements NotificationPort {
  constructor(
    private readonly email: EmailSender,
    private readonly resolver: EmailRecipientResolver,
  ) {}

  async send(message: NotificationMessage): Promise<void> {
    const to = await this.resolver.realEmailFor(message.recipientRef);
    if (to === undefined) {
      // 宛先未登録。生 PII は無いのでマスク表現でログのみ（送信はスキップ）。
      console.warn(
        `[通知:${message.kind}] 宛先未解決のため送信スキップ 予約=${message.reservationNumber}`,
      );
      return;
    }

    // body / reservationNumber はシステム生成文字列のみ（ユーザー入力・PII を含まない, NFR-002）。
    // そのため HTML へ直接展開してよい。ユーザー由来文字列を載せる場合はここでエスケープが必要。
    const body = `予約番号: ${message.reservationNumber}\n\n${message.body}\n`;
    try {
      await this.email.send({
        to,
        subject: SUBJECTS[message.kind],
        body,
        html: `<p>予約番号: ${message.reservationNumber}</p><p>${message.body}</p>`,
      });
    } catch (e) {
      // 生エラーには実アドレスが含まれ得る。マスク済みのみログし、PII を伴わないエラーへ置換して投げ直す。
      console.error(
        `[通知:${message.kind}] メール送信に失敗 宛先=${message.maskedRecipient} 予約=${message.reservationNumber}`,
      );
      if (isBlocksError(e, EmailErrors.SendFailed) || isBlocksError(e, EmailErrors.InvalidInput)) {
        throw new Error(`メール送信に失敗しました（${message.kind}）`);
      }
      throw new Error(`通知処理で予期しないエラーが発生しました（${message.kind}）`);
    }
  }
}
