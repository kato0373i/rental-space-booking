import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Scope } from "@aws-blocks/core";
import { Database } from "@aws-blocks/blocks";
import { describe, expect, it } from "vitest";
import { SpaceId } from "../../../shared/domain/Id.js";
import { unwrap } from "../../../shared/domain/Result.js";
import { buildSpaceAttributes, type SpaceInput } from "../application/spaceFactory.js";
import { Space } from "../domain/Space.js";
import type { SpaceRepository } from "../domain/ports/SpaceRepository.js";
import { InMemorySpaceRepository } from "./InMemorySpaceRepository.js";
import { BlocksSpaceRepository } from "./BlocksSpaceRepository.js";
import type { SqlDatabase } from "../../booking/infrastructure/BlocksReservationRepository.js";

const SAMPLE: SpaceInput = {
  name: "会議室A",
  capacity: 8,
  openHour: 9,
  openMinute: 0,
  closeHour: 18,
  closeMinute: 0,
  slotMinutes: 60,
  minSlots: 1,
  maxSlots: 8,
  bookableHorizonDays: 30,
  rateRules: [
    { dayKind: "Weekday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 1000 },
    { dayKind: "Saturday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 2000 },
    { dayKind: "Sunday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 2000 },
  ],
  cancellationTiers: [
    { hoursBefore: 0, feeRatePct: 50 },
    { hoursBefore: 48, feeRatePct: 0 },
  ],
};

const makeSpace = (id: string, input: SpaceInput = SAMPLE): Space =>
  unwrap(Space.register(unwrap(buildSpaceAttributes(input)), SpaceId.of(id)));

const migrationsPath = resolve(process.cwd(), "aws-blocks/migrations");

const backends: ReadonlyArray<{ name: string; make: () => SpaceRepository }> = [
  { name: "InMemory", make: () => new InMemorySpaceRepository() },
  {
    name: "Blocks(PGlite)",
    make: () => {
      const db = new Database(new Scope(`test-${randomUUID()}`), "main", { migrationsPath });
      return new BlocksSpaceRepository(db as unknown as SqlDatabase);
    },
  },
];

describe.each(backends)("SpaceRepository 契約: $name", ({ make }) => {
  it("保存したスペースを id で読み戻せる（全設定が往復する）", async () => {
    const repo = make();
    await repo.save(makeSpace("space-1"));

    const found = await repo.byId(SpaceId.of("space-1"));
    expect(found).toBeDefined();
    expect(found?.name).toBe("会議室A");
    expect(found?.capacity.value).toBe(8);
    expect(found?.minSlots).toBe(1);
    expect(found?.maxSlots).toBe(8);
    expect(found?.ratePlan.toRules().length).toBe(3);
    expect(found?.cancellationPolicy.tiers.length).toBe(2);
    expect(found?.isPublished()).toBe(true);
  });

  it("all() で全件返す", async () => {
    const repo = make();
    await repo.save(makeSpace("space-1"));
    await repo.save(makeSpace("space-2", { ...SAMPLE, name: "スタジオB" }));
    const all = await repo.all();
    expect(all.length).toBe(2);
    expect(all.map((s) => s.name).sort()).toEqual(["スタジオB", "会議室A"]);
  });

  it("公開停止状態が永続化される", async () => {
    const repo = make();
    const space = makeSpace("space-1");
    await repo.save(space);
    space.suspend();
    await repo.save(space);

    const found = await repo.byId(SpaceId.of("space-1"));
    expect(found?.isPublished()).toBe(false);
    expect(found?.publishState).toBe("Suspended");
  });

  it("編集後の設定が永続化される", async () => {
    const repo = make();
    const space = makeSpace("space-1");
    await repo.save(space);

    const edited = unwrap(buildSpaceAttributes({ ...SAMPLE, name: "改名後", capacity: 12 }));
    unwrap(space.edit(edited));
    await repo.save(space);

    const found = await repo.byId(SpaceId.of("space-1"));
    expect(found?.name).toBe("改名後");
    expect(found?.capacity.value).toBe(12);
  });

  it("存在しない id は undefined", async () => {
    const repo = make();
    expect(await repo.byId(SpaceId.of("missing"))).toBeUndefined();
  });
});
