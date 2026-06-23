import type { DomainEvent } from "./DomainEvent.js";

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => void;

/**
 * ドメインイベントの発行/購読ポート。
 * 通知アダプタはこれを購読する（Booking → Notification の単方向・結果整合）。
 */
export interface EventBus {
  publish(event: DomainEvent): void;
  subscribe(type: string, handler: EventHandler): void;
}

/** プロセス内同期ディスパッチの素朴な実装（デモ・テスト用）。 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  publish(event: DomainEvent): void {
    const hs = this.handlers.get(event.type);
    if (!hs) return;
    for (const h of hs) h(event);
  }

  subscribe(type: string, handler: EventHandler): void {
    const hs = this.handlers.get(type);
    if (hs) hs.push(handler);
    else this.handlers.set(type, [handler]);
  }
}
