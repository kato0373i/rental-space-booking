import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";

/** キャンセル料率の段階（Booking 側の独立定義）。 */
export type CancellationTier = {
  readonly hoursBefore: number;
  readonly feeRatePct: number;
};

/**
 * キャンセルポリシー VO（Booking 側のスナップショット用・独立定義, ADR-006/009）。
 * Space ドメインを import せず、SpaceCatalogPort の DTO（tiers）から写像して構築する。
 * 意味論は Space 側の正本定義と同一: 残時間 r に対し hoursBefore<=r の最大段階の料率を採る。
 */
export class CancellationPolicy {
  private constructor(readonly tiers: readonly CancellationTier[]) {}

  static fromSnapshot(tiers: readonly CancellationTier[]): Result<CancellationPolicy, string> {
    if (tiers.length === 0) return err("キャンセルポリシーには少なくとも1段階が必要です");
    const sorted = [...tiers].sort((a, b) => a.hoursBefore - b.hoursBefore);
    if (sorted[0]!.hoursBefore !== 0) {
      return err("キャンセルポリシーは hoursBefore=0 の段階を含む必要があります");
    }
    return ok(new CancellationPolicy(sorted));
  }

  feeRatePctFor(remainingHours: number): number {
    let applicable = this.tiers[0]!;
    for (const t of this.tiers) {
      if (t.hoursBefore <= remainingHours) applicable = t;
      else break;
    }
    return applicable.feeRatePct;
  }

  toSnapshot(): CancellationTier[] {
    return this.tiers.map((t) => ({ ...t }));
  }
}
