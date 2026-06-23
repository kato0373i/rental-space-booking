import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";

/** キャンセル料率の段階。「利用開始の hoursBefore 時間前以降は feeRatePct を課す」。 */
export type CancellationTier = {
  readonly hoursBefore: number;
  readonly feeRatePct: number;
};

/**
 * キャンセルポリシー VO（U-01: スペースごとに設定可能。Space 集約が正本を持つ）。
 *
 * 段階は「利用開始の N 時間前」を境界とする。残時間 r（時間）に対する料率は、
 * `hoursBefore <= r` を満たす段階のうち hoursBefore が最大のものの料率。
 *
 * 例: 「48時間前まで無料、以降50%」
 *   tiers = [{hoursBefore:0, feeRatePct:50}, {hoursBefore:48, feeRatePct:0}]
 *   r=72h → 48の段階が該当 → 0%（無料）
 *   r=24h →  0の段階が該当 → 50%
 */
export class CancellationPolicy {
  /** hoursBefore 昇順でソート済みの段階。 */
  private constructor(readonly tiers: readonly CancellationTier[]) {}

  static of(tiers: readonly CancellationTier[]): Result<CancellationPolicy, string> {
    if (tiers.length === 0) return err("キャンセルポリシーには少なくとも1段階が必要です");
    for (const t of tiers) {
      if (t.hoursBefore < 0) return err(`締切（時間前）は0以上です: ${t.hoursBefore}`);
      if (t.feeRatePct < 0 || t.feeRatePct > 100) {
        return err(`料率は0–100%です: ${t.feeRatePct}`);
      }
    }
    const sorted = [...tiers].sort((a, b) => a.hoursBefore - b.hoursBefore);
    // 残時間 r>=0 を必ず被覆するため、最小の段階は 0時間前である必要がある。
    if (sorted[0]!.hoursBefore !== 0) {
      return err("キャンセルポリシーは hoursBefore=0 の段階（直前の料率）を含む必要があります");
    }
    // 締切は昇順かつ重複なし（不変条件④）。
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.hoursBefore === sorted[i - 1]!.hoursBefore) {
        return err(`締切（時間前）が重複しています: ${sorted[i]!.hoursBefore}`);
      }
    }
    return ok(new CancellationPolicy(sorted));
  }

  /** 残時間（時間）に対するキャンセル料率（%）。 */
  feeRatePctFor(remainingHours: number): number {
    let applicable = this.tiers[0]!;
    for (const t of this.tiers) {
      if (t.hoursBefore <= remainingHours) applicable = t;
      else break;
    }
    return applicable.feeRatePct;
  }

  /** スナップショット用の素データ。Booking 側の独立 VO へ写像する（ADR-006/009）。 */
  toSnapshot(): CancellationTier[] {
    return this.tiers.map((t) => ({ ...t }));
  }
}
