import type {
  NotificationMessage,
  NotificationPort,
} from "../../booking/application/ports/NotificationPort.js";

/**
 * 複数の通知ポートへ送信をファンアウトする合成アダプタ（#11）。
 * blocks バックエンドで「SES 実送信」と「デモ用の送信ログ（モック）温存」を両立させるために使う。
 * 1 つの送信先が失敗しても他をブロックしないよう、各ポートは独立に実行し失敗は握りつぶさず集約する。
 */
export class TeeNotificationAdapter implements NotificationPort {
  private readonly targets: readonly NotificationPort[];

  constructor(targets: readonly NotificationPort[]) {
    this.targets = targets;
  }

  async send(message: NotificationMessage): Promise<void> {
    const results = await Promise.allSettled(this.targets.map((t) => t.send(message)));
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (rejected.length > 0) {
      // 個々のアダプタが PII を含まないエラーへ整形済み前提。集約して通知する。
      throw new AggregateError(
        rejected.map((r) => r.reason),
        `通知の一部送信に失敗しました（${rejected.length}/${this.targets.length}）`,
      );
    }
  }
}
