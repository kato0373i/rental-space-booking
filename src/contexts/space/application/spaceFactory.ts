import type { DayKind } from "../../../shared/domain/JstDateTime.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { ValidationError } from "../../../shared/errors.js";
import { validationError } from "../../../shared/errors.js";
import { BusinessHours } from "../domain/BusinessHours.js";
import { CancellationPolicy } from "../domain/CancellationPolicy.js";
import { Capacity } from "../domain/Capacity.js";
import { RatePlan } from "../domain/RatePlan.js";
import { RateRule } from "../domain/RateRule.js";
import { SlotDefinition } from "../domain/SlotDefinition.js";
import type { SpaceAttributes } from "../domain/Space.js";

export type RateRuleInput = {
  readonly dayKind: DayKind;
  readonly fromHour: number;
  readonly fromMinute: number;
  readonly toHour: number;
  readonly toMinute: number;
  readonly unitPriceJpy: number;
};

export type CancellationTierInput = {
  readonly hoursBefore: number;
  readonly feeRatePct: number;
};

/** スペース登録/編集の入力（プリミティブ）。アプリ層が VO へ組み立てて検証する。 */
export type SpaceInput = {
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
  readonly rateRules: readonly RateRuleInput[];
  readonly cancellationTiers: readonly CancellationTierInput[];
};

/** プリミティブ入力から SpaceAttributes（VO群）を組み立てる。VO のバリデーションを集約する。 */
export function buildSpaceAttributes(
  input: SpaceInput,
): Result<SpaceAttributes, ValidationError> {
  const details: string[] = [];

  const capacity = Capacity.of(input.capacity);
  if (!capacity.ok) details.push(capacity.error);

  const businessHours = BusinessHours.of(
    input.openHour,
    input.openMinute,
    input.closeHour,
    input.closeMinute,
  );
  if (!businessHours.ok) details.push(businessHours.error);

  const slotDefinition = SlotDefinition.of(input.slotMinutes);
  if (!slotDefinition.ok) details.push(slotDefinition.error);

  const rules: RateRule[] = [];
  for (const r of input.rateRules) {
    const rule = RateRule.of(r.dayKind, r.fromHour, r.fromMinute, r.toHour, r.toMinute, r.unitPriceJpy);
    if (!rule.ok) details.push(rule.error);
    else rules.push(rule.value);
  }
  const ratePlan = rules.length > 0 ? RatePlan.of(rules) : undefined;
  if (ratePlan && !ratePlan.ok) details.push(ratePlan.error);

  const cancellationPolicy = CancellationPolicy.of(input.cancellationTiers);
  if (!cancellationPolicy.ok) details.push(cancellationPolicy.error);

  if (
    !capacity.ok ||
    !businessHours.ok ||
    !slotDefinition.ok ||
    !ratePlan ||
    !ratePlan.ok ||
    !cancellationPolicy.ok
  ) {
    return err(validationError("スペース設定が不正です", details));
  }

  return ok({
    name: input.name,
    capacity: capacity.value,
    businessHours: businessHours.value,
    slotDefinition: slotDefinition.value,
    ratePlan: ratePlan.value,
    cancellationPolicy: cancellationPolicy.value,
    minSlots: input.minSlots,
    maxSlots: input.maxSlots,
    bookableHorizonDays: input.bookableHorizonDays,
  });
}
