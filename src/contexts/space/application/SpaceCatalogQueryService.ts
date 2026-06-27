import type { SpaceId } from "../../../shared/domain/Id.js";
import { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { Money } from "../../../shared/domain/Money.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { NotFound, ValidationError } from "../../../shared/errors.js";
import { notFound } from "../../../shared/errors.js";
import type {
  SpaceCatalogDto,
  SpaceCatalogPort,
} from "../../booking/application/ports/SpaceCatalogPort.js";
import type { SpaceRepository } from "../domain/ports/SpaceRepository.js";

/**
 * Booking の SpaceCatalogPort を Space コンテキストが実装供給する（依存性逆転, ADR-009）。
 * ドメインモデルは渡さず、読み取り DTO と値（Money）のみを返す。
 */
export class SpaceCatalogQueryService implements SpaceCatalogPort {
  constructor(private readonly spaces: SpaceRepository) {}

  async getCatalog(spaceId: SpaceId): Promise<Result<SpaceCatalogDto, NotFound>> {
    const space = await this.spaces.byId(spaceId);
    if (!space) return err(notFound("スペースが見つかりません"));
    return ok({
      spaceId,
      isPublished: space.isPublished(),
      openMinuteOfDay: space.businessHours.openMinute,
      closeMinuteOfDay: space.businessHours.closeMinute,
      slotMinutes: space.slotDefinition.slotMinutes,
      minSlots: space.minSlots,
      maxSlots: space.maxSlots,
      bookableHorizonDays: space.bookableHorizonDays,
      cancellationTiers: space.cancellationPolicy.toSnapshot(),
    });
  }

  async quote(
    spaceId: SpaceId,
    slotStarts: readonly JstDateTime[],
  ): Promise<Result<Money, NotFound | ValidationError>> {
    const space = await this.spaces.byId(spaceId);
    if (!space) return err(notFound("スペースが見つかりません"));
    return space.quote(slotStarts);
  }

  async generateSlots(
    spaceId: SpaceId,
    fromDay: JstDateTime,
    toDay: JstDateTime,
  ): Promise<Result<JstDateTime[], NotFound>> {
    const space = await this.spaces.byId(spaceId);
    if (!space) return err(notFound("スペースが見つかりません"));

    const out: JstDateTime[] = [];
    const lastDayStart = toDay.startOfDayJst().epochMillis;
    for (
      let day = fromDay.startOfDayJst();
      day.epochMillis <= lastDayStart;
      day = day.addDays(1)
    ) {
      out.push(...space.generateSlotStarts(day));
    }
    return ok(out);
  }
}
