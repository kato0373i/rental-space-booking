import type { SpaceId } from "../../../../shared/domain/Id.js";
import type { JstDateTime } from "../../../../shared/domain/JstDateTime.js";
import type { Money } from "../../../../shared/domain/Money.js";
import type { Result } from "../../../../shared/domain/Result.js";
import type { NotFound, ValidationError } from "../../../../shared/errors.js";

export type CancellationTierDto = {
  readonly hoursBefore: number;
  readonly feeRatePct: number;
};

/**
 * Booking が必要とするスペース情報の読み取り DTO（ADR-009: ドメインモデルは渡さず値/DTOのみ）。
 * 価格計算ロジックは Space 側に残し、Booking は quote() の結果（Money）を受け取る。
 */
export type SpaceCatalogDto = {
  readonly spaceId: SpaceId;
  readonly isPublished: boolean;
  readonly openMinuteOfDay: number;
  readonly closeMinuteOfDay: number;
  readonly slotMinutes: number;
  readonly minSlots: number;
  readonly maxSlots: number;
  readonly bookableHorizonDays: number;
  readonly cancellationTiers: readonly CancellationTierDto[];
};

/**
 * スペースカタログ照会ポート（Booking が所有・Space が実装供給, 依存性逆転）。
 */
export interface SpaceCatalogPort {
  getCatalog(spaceId: SpaceId): Promise<Result<SpaceCatalogDto, NotFound>>;
  /** 連続スロット群の合計金額（FR-011）。価格計算は Space 側で実施。 */
  quote(
    spaceId: SpaceId,
    slotStarts: readonly JstDateTime[],
  ): Promise<Result<Money, NotFound | ValidationError>>;
  /** 指定 JST 暦日範囲 [fromDay, toDay] の営業スロット開始時刻すべて（FR-010 候補生成元）。 */
  generateSlots(
    spaceId: SpaceId,
    fromDay: JstDateTime,
    toDay: JstDateTime,
  ): Promise<Result<JstDateTime[], NotFound>>;
}
