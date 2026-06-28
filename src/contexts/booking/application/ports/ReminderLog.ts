import type { ReservationId } from "../../../../shared/domain/Id.js";

/**
 * リマインド送信済みログ（冪等性ポート, #12）。
 *
 * リマインドは利用開始24時間前の Confirmed 予約に1回だけ送る（FR-032 / U-03）。しかし
 * Scheduled tasks Block（cron）は短間隔で繰り返し起動し、同一予約が窓 [now, now+24h) に
 * 滞在し続けるため、素朴な実装では同じ予約へ何度も送ってしまう。本ポートで「初回だけ送る」
 * 主張（claim）をアトミックに行い、二重送信を防ぐ。
 *
 * cron は at-least-once 配信のためハンドラ自体も冪等であることが要求される（CronJob 仕様）。
 */
export interface ReminderLog {
  /**
   * 当該予約のリマインドを「初回として確保」する。まだ送っていなければ記録して true、
   * すでに記録済みなら false を返す（アトミックな check-and-set）。
   */
  markIfFirst(reservationId: ReservationId): Promise<boolean>;
}
