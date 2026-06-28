import { sql } from "@aws-blocks/blocks";
import type { ReservationId } from "../../../shared/domain/Id.js";
import type { ReminderLog } from "../application/ports/ReminderLog.js";
import type { SqlDatabase } from "./BlocksReservationRepository.js";

/**
 * リマインド送信済みログの AWS Blocks Database 実装（#12）。
 * `sent_reminders` テーブルの主キー制約で「予約ごとに1行」を保証し、
 * `INSERT ... ON CONFLICT DO NOTHING` の挿入有無（rowCount）でアトミックに初回判定する。
 * ポート契約はインメモリ実装と同値（契約テストで担保）。
 */
export class BlocksReminderLog implements ReminderLog {
  constructor(private readonly db: SqlDatabase) {}

  async markIfFirst(reservationId: ReservationId): Promise<boolean> {
    const result = await this.db.execute(
      sql`INSERT INTO sent_reminders (reservation_id) VALUES (${reservationId})
          ON CONFLICT (reservation_id) DO NOTHING`,
    );
    // 挿入されたら初回（=送る）、競合で 0 件なら送信済み（=スキップ）。
    return result.rowCount === 1;
  }
}
