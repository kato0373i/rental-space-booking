import { describe, expect, it } from "vitest";
import { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import { isOk } from "../../../shared/domain/Result.js";
import { buildSpaceAttributes, type SpaceInput } from "../application/spaceFactory.js";
import { Space } from "./Space.js";

const fullCoverageRules: SpaceInput["rateRules"] = [
  { dayKind: "Weekday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 1000 },
  { dayKind: "Saturday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 2000 },
  { dayKind: "Sunday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 2000 },
];

const baseInput: SpaceInput = {
  name: "会議室",
  capacity: 8,
  openHour: 9,
  openMinute: 0,
  closeHour: 18,
  closeMinute: 0,
  slotMinutes: 60,
  minSlots: 1,
  maxSlots: 8,
  bookableHorizonDays: 30,
  rateRules: fullCoverageRules,
  cancellationTiers: [
    { hoursBefore: 0, feeRatePct: 50 },
    { hoursBefore: 48, feeRatePct: 0 },
  ],
};

const registerFrom = (input: SpaceInput) => {
  const attrs = buildSpaceAttributes(input);
  if (!attrs.ok) return attrs;
  return Space.register(attrs.value);
};

describe("Space（スペース集約）", () => {
  it("FR-004: 営業時間09:00–18:00・60分なら09:00〜17:00開始の9スロットが生成される", () => {
    const space = registerFrom(baseInput);
    expect(isOk(space)).toBe(true);
    if (!space.ok) return;

    const day = JstDateTime.ofJstUnsafe(2026, 6, 24, 0, 0);
    const slots = space.value.generateSlotStarts(day);
    expect(slots.length).toBe(9);
    expect(slots[0]!.minuteOfDayJst()).toBe(9 * 60); // 09:00
    expect(slots[8]!.minuteOfDayJst()).toBe(17 * 60); // 17:00（営業時間外は生成されない）
  });

  it("FR-005: 料金表が全スロットを被覆しないと登録時に設定不備として検出される", () => {
    // 土日の規則を欠いた料金表 → 被覆漏れ
    const input: SpaceInput = {
      ...baseInput,
      rateRules: [
        { dayKind: "Weekday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 1000 },
      ],
    };
    const space = registerFrom(input);
    expect(space.ok).toBe(false);
    if (space.ok) return;
    expect(space.error.kind).toBe("ValidationError");
  });

  it("FR-011: 時間帯別単価をまたぐ見積もりは各スロット単価の合計になる", () => {
    // 09:00–22:00、平日 昼1000 / 夜2000
    const input: SpaceInput = {
      ...baseInput,
      closeHour: 22,
      rateRules: [
        { dayKind: "Weekday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 1000 },
        { dayKind: "Weekday", fromHour: 18, fromMinute: 0, toHour: 22, toMinute: 0, unitPriceJpy: 2000 },
        { dayKind: "Saturday", fromHour: 9, fromMinute: 0, toHour: 22, toMinute: 0, unitPriceJpy: 2500 },
        { dayKind: "Sunday", fromHour: 9, fromMinute: 0, toHour: 22, toMinute: 0, unitPriceJpy: 2500 },
      ],
    };
    const space = registerFrom(input);
    expect(isOk(space)).toBe(true);
    if (!space.ok) return;

    // 2026-06-24 は平日。17:00(1000) + 18:00(2000) = 3000
    const s17 = JstDateTime.ofJstUnsafe(2026, 6, 24, 17, 0);
    const s18 = JstDateTime.ofJstUnsafe(2026, 6, 24, 18, 0);
    expect(s17.dayKind()).toBe("Weekday");
    const quote = space.value.quote([s17, s18]);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.value.amount).toBe(3000);
  });

  it("不変条件①: スロット長が営業時間を割り切らないと登録できない", () => {
    const input: SpaceInput = { ...baseInput, slotMinutes: 50 }; // 540分は50で割り切れない
    expect(registerFrom(input).ok).toBe(false);
  });
});
