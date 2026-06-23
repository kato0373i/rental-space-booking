import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";

/** 収容人数 VO。 */
export class Capacity {
  private constructor(readonly value: number) {}

  static of(value: number): Result<Capacity, string> {
    if (!Number.isInteger(value) || value < 0) {
      return err(`収容人数は0以上の整数です: ${value}`);
    }
    return ok(new Capacity(value));
  }
}
