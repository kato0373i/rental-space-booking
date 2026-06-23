import { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";

/**
 * 連続スロット群 VO（P-02）。1スペース内の連続した固定スロットの並び。
 * 構築時に「昇順・重複なし・連続（隣接スロットが slotMinutes 間隔）」を保証する（FR-014①連続性）。
 */
export class SlottedPeriod {
  private constructor(
    private readonly starts: readonly JstDateTime[],
    readonly slotMinutes: number,
  ) {}

  static of(
    slotStarts: readonly JstDateTime[],
    slotMinutes: number,
  ): Result<SlottedPeriod, string> {
    if (slotStarts.length === 0) return err("少なくとも1スロットを選択してください");
    if (slotMinutes <= 0) return err("スロット長が不正です");
    const sorted = [...slotStarts].sort((a, b) => a.epochMillis - b.epochMillis);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      const expected = prev.addMinutes(slotMinutes);
      if (cur.epochMillis === prev.epochMillis) {
        return err("同一スロットが重複しています");
      }
      if (cur.epochMillis !== expected.epochMillis) {
        return err("連続したスロットを選択してください");
      }
    }
    return ok(new SlottedPeriod(sorted, slotMinutes));
  }

  slotStarts(): readonly JstDateTime[] {
    return this.starts;
  }

  count(): number {
    return this.starts.length;
  }

  /** 利用開始時刻（最初のスロット開始）。 */
  start(): JstDateTime {
    return this.starts[0]!;
  }

  /** 利用終了時刻（最後のスロット開始 + slotMinutes、排他端）。 */
  endExclusive(): JstDateTime {
    return this.starts[this.starts.length - 1]!.addMinutes(this.slotMinutes);
  }
}
