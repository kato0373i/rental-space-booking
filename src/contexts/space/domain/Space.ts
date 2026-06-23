import type { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { Money } from "../../../shared/domain/Money.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { ValidationError } from "../../../shared/errors.js";
import { validationError } from "../../../shared/errors.js";
import { SpaceId } from "../../../shared/domain/Id.js";
import type { BusinessHours } from "./BusinessHours.js";
import type { CancellationPolicy } from "./CancellationPolicy.js";
import type { Capacity } from "./Capacity.js";
import type { PublishState } from "./PublishState.js";
import type { RatePlan } from "./RatePlan.js";
import type { SlotDefinition } from "./SlotDefinition.js";

/** スペースの構成属性（VO に組み立て済み）。register / edit 共通の入力。 */
export type SpaceAttributes = {
  readonly name: string;
  readonly capacity: Capacity;
  readonly businessHours: BusinessHours;
  readonly slotDefinition: SlotDefinition;
  readonly ratePlan: RatePlan;
  readonly cancellationPolicy: CancellationPolicy;
  readonly minSlots: number;
  readonly maxSlots: number;
  readonly bookableHorizonDays: number;
};

/**
 * スペース集約ルート（支援サブドメイン）。営業時間・スロット定義・料金表・
 * キャンセルポリシー・公開状態を保持する「設定」。予約のたびには変化しない（ADR-002）。
 *
 * 不変条件: ①スロット長が営業時間を割り切る ②生成スロットは営業時間内のみ（構築上保証）
 * ③RatePlan が全スロットを被覆 ④料率0–100%・締切昇順（VOで保証） ⑤単価・金額0以上（VOで保証）。
 */
export class Space {
  private constructor(
    readonly id: SpaceId,
    private attrs: SpaceAttributes,
    private state: PublishState,
  ) {}

  static register(
    attrs: SpaceAttributes,
    id: SpaceId = SpaceId.generate(),
  ): Result<Space, ValidationError> {
    const validated = Space.validateAttributes(attrs);
    if (!validated.ok) return validated;
    // 新規登録は「公開」状態で作成される（FR-001）。
    return ok(new Space(id, attrs, "Published"));
  }

  private static validateAttributes(attrs: SpaceAttributes): Result<void, ValidationError> {
    const details: string[] = [];
    if (attrs.name.trim() === "") details.push("名称は必須です");
    if (attrs.minSlots < 1) details.push("最小スロット数は1以上です");
    if (attrs.maxSlots < attrs.minSlots) {
      details.push("最大スロット数は最小スロット数以上です");
    }
    if (attrs.bookableHorizonDays <= 0) details.push("予約可能上限日数は1以上です");

    // 不変条件①: スロット長は営業時間を割り切る。
    if (attrs.businessHours.spanMinutes() % attrs.slotDefinition.slotMinutes !== 0) {
      details.push("スロット長は営業時間を割り切る必要があります");
    }

    // 不変条件③: 料金表が営業時間内の全スロットを被覆する。
    const coverage = attrs.ratePlan.validateCoverage(
      attrs.businessHours,
      attrs.slotDefinition,
    );
    if (!coverage.ok) {
      details.push(`料金表が被覆していないスロット: ${coverage.error.join(", ")}`);
    }

    return details.length === 0
      ? ok(undefined)
      : err(validationError("スペース設定が不正です", details));
  }

  /** 属性を改定する（FR-002）。確定済み予約はスナップショットを持つため影響を受けない。 */
  edit(attrs: SpaceAttributes): Result<void, ValidationError> {
    const validated = Space.validateAttributes(attrs);
    if (!validated.ok) return validated;
    this.attrs = attrs;
    return ok(undefined);
  }

  suspend(): void {
    this.state = "Suspended";
  }

  resume(): void {
    this.state = "Published";
  }

  isPublished(): boolean {
    return this.state === "Published";
  }

  get name(): string {
    return this.attrs.name;
  }
  get publishState(): PublishState {
    return this.state;
  }
  get businessHours(): BusinessHours {
    return this.attrs.businessHours;
  }
  get slotDefinition(): SlotDefinition {
    return this.attrs.slotDefinition;
  }
  get cancellationPolicy(): CancellationPolicy {
    return this.attrs.cancellationPolicy;
  }
  get minSlots(): number {
    return this.attrs.minSlots;
  }
  get maxSlots(): number {
    return this.attrs.maxSlots;
  }
  get bookableHorizonDays(): number {
    return this.attrs.bookableHorizonDays;
  }
  get capacity(): Capacity {
    return this.attrs.capacity;
  }

  /** 指定 JST 暦日の、営業時間内の全スロット開始時刻を生成する（FR-004/010）。 */
  generateSlotStarts(day: JstDateTime): JstDateTime[] {
    const startOfDay = day.startOfDayJst();
    const { slotMinutes } = this.attrs.slotDefinition;
    const { openMinute, closeMinute } = this.attrs.businessHours;
    const starts: JstDateTime[] = [];
    for (let m = openMinute; m + slotMinutes <= closeMinute; m += slotMinutes) {
      starts.push(startOfDay.addMinutes(m));
    }
    return starts;
  }

  /** 連続スロット群の合計金額（FR-011）。被覆漏れがあれば ValidationError。 */
  quote(slotStarts: readonly JstDateTime[]): Result<Money, ValidationError> {
    const result = this.attrs.ratePlan.quote(slotStarts);
    if (!result.ok) return err(validationError(result.error));
    return ok(result.value);
  }

  /** 指定スロット開始が営業時間内か（曜日に依らず時刻帯で判定）。 */
  isWithinBusinessHours(slotStart: JstDateTime): boolean {
    return this.attrs.businessHours.containsMinuteOfDay(slotStart.minuteOfDayJst());
  }
}
