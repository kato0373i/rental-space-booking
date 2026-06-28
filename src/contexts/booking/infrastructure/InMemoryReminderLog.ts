import type { ReservationId } from "../../../shared/domain/Id.js";
import type { ReminderLog } from "../application/ports/ReminderLog.js";

/**
 * リマインド送信済みログのインメモリ実装（#12）。学習・テスト・デモ用に共存（NFR-003）。
 * JS 単一スレッドのため、`has` → `add` 間に `await` を挟まなければ check-and-set はアトミック。
 */
export class InMemoryReminderLog implements ReminderLog {
  private readonly sent = new Set<string>();

  async markIfFirst(reservationId: ReservationId): Promise<boolean> {
    if (this.sent.has(reservationId)) return false;
    this.sent.add(reservationId);
    return true;
  }
}
