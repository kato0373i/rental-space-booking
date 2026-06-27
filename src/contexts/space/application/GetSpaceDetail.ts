import type { SpaceId } from "../../../shared/domain/Id.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { NotFound } from "../../../shared/errors.js";
import { notFound } from "../../../shared/errors.js";
import type { RateRuleView } from "../domain/RatePlan.js";
import type { SpaceRepository } from "../domain/ports/SpaceRepository.js";

/** キャンセル段階の素データ（編集フォーム用）。 */
export type CancellationTierView = {
  readonly hoursBefore: number;
  readonly feeRatePct: number;
};

/**
 * スペースの全設定を編集フォーム初期値用にプリミティブで返す読み取りモデル（B-3, FR-AD03）。
 * 構成は backend の SpaceInput に対応し、spaceId と publishState を加える。
 */
export type SpaceDetail = {
  readonly spaceId: string;
  readonly name: string;
  readonly capacity: number;
  readonly openHour: number;
  readonly openMinute: number;
  readonly closeHour: number;
  readonly closeMinute: number;
  readonly slotMinutes: number;
  readonly minSlots: number;
  readonly maxSlots: number;
  readonly bookableHorizonDays: number;
  readonly rateRules: readonly RateRuleView[];
  readonly cancellationTiers: readonly CancellationTierView[];
  readonly publishState: string;
};

/** スペース詳細（編集初期値）を取得する管理者向けクエリ（FR-AD03）。 */
export class GetSpaceDetail {
  constructor(private readonly spaces: SpaceRepository) {}

  execute(spaceId: SpaceId): Result<SpaceDetail, NotFound> {
    const space = this.spaces.byId(spaceId);
    if (!space) return err(notFound("スペースが見つかりません"));

    const { openMinute, closeMinute } = space.businessHours;
    return ok({
      spaceId: space.id,
      name: space.name,
      capacity: space.capacity.value,
      openHour: Math.floor(openMinute / 60),
      openMinute: openMinute % 60,
      closeHour: Math.floor(closeMinute / 60),
      closeMinute: closeMinute % 60,
      slotMinutes: space.slotDefinition.slotMinutes,
      minSlots: space.minSlots,
      maxSlots: space.maxSlots,
      bookableHorizonDays: space.bookableHorizonDays,
      rateRules: space.ratePlan.toRules(),
      cancellationTiers: space.cancellationPolicy.tiers.map((t) => ({
        hoursBefore: t.hoursBefore,
        feeRatePct: t.feeRatePct,
      })),
      publishState: space.isPublished() ? "Published" : "Suspended",
    });
  }
}
