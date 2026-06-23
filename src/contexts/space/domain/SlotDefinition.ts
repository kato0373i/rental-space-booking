import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";

/** 固定スロット長の定義 VO（FR-004）。 */
export class SlotDefinition {
  private constructor(readonly slotMinutes: number) {}

  static of(slotMinutes: number): Result<SlotDefinition, string> {
    if (!Number.isInteger(slotMinutes) || slotMinutes <= 0) {
      return err(`スロット長は正の整数（分）です: ${slotMinutes}`);
    }
    return ok(new SlotDefinition(slotMinutes));
  }
}
