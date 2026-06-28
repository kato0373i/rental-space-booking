import { Scope } from "@aws-blocks/core";
import { AsyncJob } from "@aws-blocks/blocks";
import type { DomainEvent } from "../domain/DomainEvent.js";
import type { EventBus, EventHandler } from "../domain/EventBus.js";

/**
 * ドメインイベントを Background jobs Block（AsyncJob / SQS+Lambda）で非同期処理する EventBus 実装（#13, ADR-AB09）。
 *
 * `publish` はイベントをジョブとして投入して即時に返り（発火元を実行時間に結合しない, 結果整合）、
 * 購読ハンドラはワーカー（AsyncJob ハンドラ）で非同期実行される。ハンドラが reject すると AsyncJob が
 * 自動でリトライし、`maxRetries` 超過で DLQ（dead-letter）へ送られる。ローカルは Block のモック
 * （実 AWS 不要、ハンドラは `setTimeout` で実行）として動作する。
 *
 * 配信は at-least-once（リトライ・重複あり）。ハンドラは冪等であることが要求される
 * （リマインドは {@link ReminderLog} で冪等化済み, #12）。ポート（publish/subscribe）は維持する。
 */
export class BlocksEventBus implements EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly job: AsyncJob<DomainEvent>;

  constructor(scope: Scope, options: { readonly id?: string; readonly maxRetries?: number } = {}) {
    this.job = new AsyncJob<DomainEvent>(scope, options.id ?? "domain-events", {
      maxRetries: options.maxRetries ?? 3,
      // ワーカー本体: 当該 type の購読ハンドラを順に実行する。いずれかが throw すると
      // ジョブ全体がリトライ対象になる（at-least-once。ハンドラは冪等であること）。
      handler: async (event) => {
        const hs = this.handlers.get(event.type) ?? [];
        for (const h of hs) await h(event);
      },
    });
  }

  publish(event: DomainEvent): void {
    // ジョブ投入は fire-and-forget（結果整合）。投入自体の失敗のみログに残す。
    void this.job.submit(event).catch((e: unknown) => {
      console.error(`[BlocksEventBus] ジョブ投入失敗 type=${event.type}`, e);
    });
  }

  subscribe(type: string, handler: EventHandler): void {
    const hs = this.handlers.get(type);
    if (hs) hs.push(handler);
    else this.handlers.set(type, [handler]);
  }

  /** DLQ（リトライ超過で失敗確定）に滞留したジョブ数。観測・テスト用。 */
  deadLetterCount(): number {
    return this.job._queue.failed.length;
  }

  /** 正常完了したジョブ数。観測・テスト用。 */
  completedCount(): number {
    return this.job._queue.totalCompleted;
  }
}
