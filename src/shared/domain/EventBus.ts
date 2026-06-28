import type { DomainEvent } from "./DomainEvent.js";

/**
 * イベントハンドラ。非同期ワーカー化（#13）に伴い `Promise<void>` を返せる。
 * 戻り値の Promise が reject した場合、Background jobs Block 実装ではリトライ/DLQ の対象になる。
 */
export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => void | Promise<void>;

/**
 * ドメインイベントの発行/購読ポート（#13 でも維持）。
 * 通知アダプタはこれを購読する（Booking → Notification の単方向・結果整合）。
 * `publish` は即時に返る（結果整合）。実際のハンドラ実行は実装に委ねる
 * （インメモリ=プロセス内 fire-and-forget / Blocks=Background jobs の非同期ワーカー, ADR-AB09）。
 */
export interface EventBus {
  publish(event: DomainEvent): void;
  subscribe(type: string, handler: EventHandler): void;
}

/**
 * プロセス内ディスパッチの素朴な実装（デモ・テスト用, NFR-003）。
 * ハンドラは fire-and-forget で起動し（発火元を実行時間に結合しない, ADR-AB06）、
 * 例外はログに留める（リトライは行わない。耐障害なリトライ/DLQ は Blocks 実装で提供, ADR-AB09）。
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  publish(event: DomainEvent): void {
    const hs = this.handlers.get(event.type);
    if (!hs) return;
    for (const h of hs) {
      void Promise.resolve()
        .then(() => h(event))
        .catch((e: unknown) => console.error(`[EventBus] ハンドラ失敗 type=${event.type}`, e));
    }
  }

  subscribe(type: string, handler: EventHandler): void {
    const hs = this.handlers.get(type);
    if (hs) hs.push(handler);
    else this.handlers.set(type, [handler]);
  }
}
