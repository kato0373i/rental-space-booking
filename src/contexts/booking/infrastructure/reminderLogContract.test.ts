import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Scope } from "@aws-blocks/core";
import { Database } from "@aws-blocks/blocks";
import { beforeEach, describe, expect, it } from "vitest";
import { ReservationId } from "../../../shared/domain/Id.js";
import type { ReminderLog } from "../application/ports/ReminderLog.js";
import { InMemoryReminderLog } from "./InMemoryReminderLog.js";
import { BlocksReminderLog } from "./BlocksReminderLog.js";
import type { SqlDatabase } from "./BlocksReservationRepository.js";

const migrationsPath = resolve(process.cwd(), "aws-blocks/migrations");

// インメモリ/Blocks 両実装に同一の冪等契約をかける（ADR-AB05/AB08）。
const backends: ReadonlyArray<{ name: string; make: () => ReminderLog }> = [
  { name: "InMemory", make: () => new InMemoryReminderLog() },
  {
    name: "Blocks(PGlite)",
    make: () => {
      const db = new Database(new Scope(`test-${randomUUID()}`), "main", { migrationsPath });
      return new BlocksReminderLog(db as unknown as SqlDatabase);
    },
  },
];

describe.each(backends)("ReminderLog 契約: $name", ({ make }) => {
  let log: ReminderLog;
  beforeEach(() => {
    log = make();
  });

  it("初回 markIfFirst は true（送る）、2回目以降は false（スキップ）", async () => {
    const id = ReservationId.of("rsv-1");
    expect(await log.markIfFirst(id)).toBe(true);
    expect(await log.markIfFirst(id)).toBe(false);
    expect(await log.markIfFirst(id)).toBe(false);
  });

  it("予約ごとに独立して初回判定する", async () => {
    expect(await log.markIfFirst(ReservationId.of("rsv-a"))).toBe(true);
    expect(await log.markIfFirst(ReservationId.of("rsv-b"))).toBe(true);
    expect(await log.markIfFirst(ReservationId.of("rsv-a"))).toBe(false);
  });
});
