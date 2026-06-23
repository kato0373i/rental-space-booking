import type { SpaceId } from "../../../shared/domain/Id.js";
import type { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { Money } from "../../../shared/domain/Money.js";
import type { Result } from "../../../shared/domain/Result.js";
import type { NotFound, ValidationError } from "../../../shared/errors.js";
import type { SpaceCatalogPort } from "./ports/SpaceCatalogPort.js";

export type QuoteInput = {
  readonly spaceId: SpaceId;
  readonly slotStarts: readonly JstDateTime[];
};

/** 料金見積もり（FR-011）。価格計算は Space 側（ADR-009）。 */
export class QuoteReservation {
  constructor(private readonly catalog: SpaceCatalogPort) {}

  execute(input: QuoteInput): Result<Money, NotFound | ValidationError> {
    return this.catalog.quote(input.spaceId, input.slotStarts);
  }
}
