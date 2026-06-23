import type { JstDateTime } from "./JstDateTime.js";

/**
 * ドメインイベントの基底。過去形の type を持つ（設計書 §3 ドメインイベント）。
 * 通知は結果整合（イベント購読）で連携し、Booking への逆流は持たない。
 */
export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: JstDateTime;
}
