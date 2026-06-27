import type { SpaceId } from "../../../shared/domain/Id.js";
import type { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { Result } from "../../../shared/domain/Result.js";
import { ok } from "../../../shared/domain/Result.js";
import type { NotFound } from "../../../shared/errors.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";
import type { SpaceCatalogPort } from "./ports/SpaceCatalogPort.js";

export type SearchAvailabilityInput = {
  readonly spaceId: SpaceId;
  readonly fromDay: JstDateTime;
  readonly toDay: JstDateTime;
};

export type AvailabilityResult = {
  /** 空きスロット開始時刻（ISO JST）。空配列は「空きなし」（エラーではない, FR-010）。 */
  readonly freeSlots: readonly string[];
};

/**
 * スペース検索・空き枠照会（FR-010）。
 * 空き ＝ 営業時間内の候補スロット − （Pending/Confirmed が占有するスロット）。
 */
export class SearchAvailability {
  constructor(
    private readonly catalog: SpaceCatalogPort,
    private readonly reservations: ReservationRepository,
  ) {}

  async execute(input: SearchAvailabilityInput): Promise<Result<AvailabilityResult, NotFound>> {
    const candidates = await this.catalog.generateSlots(input.spaceId, input.fromDay, input.toDay);
    if (!candidates.ok) return candidates;

    const fromInclusive = input.fromDay.startOfDayJst();
    const toExclusive = input.toDay.startOfDayJst().addDays(1);
    const occupied = await this.reservations.occupiedSlots(
      input.spaceId,
      fromInclusive,
      toExclusive,
    );
    const occupiedEpochs = new Set(occupied.map((s) => s.epochMillis));

    const freeSlots = candidates.value
      .filter((c) => !occupiedEpochs.has(c.epochMillis))
      .map((c) => c.toIsoJst());

    return ok({ freeSlots });
  }
}
