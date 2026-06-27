import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Scope } from "@aws-blocks/core";
import { Database } from "@aws-blocks/blocks";
import { beforeEach, describe, expect, it } from "vitest";
import { CustomerId, SpaceId } from "../../../shared/domain/Id.js";
import { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import { Money } from "../../../shared/domain/Money.js";
import { unwrap } from "../../../shared/domain/Result.js";
import { CancellationPolicy } from "../domain/CancellationPolicy.js";
import { Reservation } from "../domain/Reservation.js";
import { SlottedPeriod } from "../domain/SlottedPeriod.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";
import { InMemoryReservationRepository } from "./InMemoryReservationRepository.js";
import { BlocksReservationRepository, type SqlDatabase } from "./BlocksReservationRepository.js";

const now = JstDateTime.ofJstUnsafe(2026, 6, 20, 9, 0);
const slot10 = JstDateTime.ofJstUnsafe(2026, 6, 24, 10, 0);
const slot11 = JstDateTime.ofJstUnsafe(2026, 6, 24, 11, 0);
const spaceId = SpaceId.of("space-1");
const policy = unwrap(CancellationPolicy.fromSnapshot([{ hoursBefore: 0, feeRatePct: 50 }]));

const pendingOn = (customer: string, slots: JstDateTime[] = [slot10]): Reservation =>
  Reservation.pending({
    spaceId,
    customerId: CustomerId.of(customer),
    period: unwrap(SlottedPeriod.of(slots, 60)),
    price: Money.ofUnsafe(1000),
    policy,
    now,
  });

const dayRange = () => {
  const from = JstDateTime.ofJstUnsafe(2026, 6, 24, 0, 0);
  return { from, to: from.addDays(1) };
};

const migrationsPath = resolve(process.cwd(), "aws-blocks/migrations");

// 各実装を同一の契約テストにかける（ADR-AB05 契約テスト）。
const backends: ReadonlyArray<{ name: string; make: () => ReservationRepository }> = [
  { name: "InMemory", make: () => new InMemoryReservationRepository() },
  {
    name: "Blocks(PGlite)",
    // 一意な Scope ID で毎回新しいローカル DB を割り当て、テスト間を隔離する。
    make: () => {
      const db = new Database(new Scope(`test-${randomUUID()}`), "main", { migrationsPath });
      return new BlocksReservationRepository(db as unknown as SqlDatabase);
    },
  },
];

describe.each(backends)("ReservationRepository 契約: $name", ({ make }) => {
  let repo: ReservationRepository;
  beforeEach(() => {
    repo = make();
  });

  it("保存した予約を id / 予約番号 / 顧客で読み戻せる", async () => {
    const a = pendingOn("cust-a");
    expect((await repo.save(a)).ok).toBe(true);

    const byId = await repo.byId(a.id);
    expect(byId?.id).toBe(a.id);
    const byNum = await repo.byNumber(a.reservationNumber.value);
    expect(byNum?.id).toBe(a.id);
    const mine = await repo.byCustomer(CustomerId.of("cust-a"));
    expect(mine.length).toBe(1);
  });

  it("同一スロットの後続予約は ConflictError（ダブルブッキング防止）", async () => {
    expect((await repo.save(pendingOn("cust-a"))).ok).toBe(true);
    const result = await repo.save(pendingOn("cust-b"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("ConflictError");
  });

  it("部分的に重なるスロットも競合する", async () => {
    expect((await repo.save(pendingOn("cust-a", [slot10, slot11]))).ok).toBe(true);
    const overlap = await repo.save(pendingOn("cust-b", [slot11]));
    expect(overlap.ok).toBe(false);
  });

  it("Aborted へ遷移して保存すると占有が解放され再確保できる", async () => {
    const a = pendingOn("cust-a");
    await repo.save(a);
    unwrap(a.abort("Failed", now));
    expect((await repo.save(a)).ok).toBe(true);
    expect((await repo.save(pendingOn("cust-b"))).ok).toBe(true);
  });

  it("occupiedSlots は Pending/Confirmed のみを返す", async () => {
    const a = pendingOn("cust-a");
    await repo.save(a);
    const { from, to } = dayRange();
    expect((await repo.occupiedSlots(spaceId, from, to)).length).toBe(1);

    unwrap(a.abort("Failed", now));
    await repo.save(a);
    expect((await repo.occupiedSlots(spaceId, from, to)).length).toBe(0);
  });

  it("version が進んでいない再保存は IllegalState（楽観ロック）", async () => {
    const a = pendingOn("cust-a");
    expect((await repo.save(a)).ok).toBe(true);
    // 同一 version のまま再保存 → 状態遷移競合として検出。
    const again = await repo.save(a);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.kind).toBe("IllegalState");
  });

  it("list は status フィルタとページングの total を返す", async () => {
    await repo.save(pendingOn("cust-a", [slot10]));
    await repo.save(pendingOn("cust-b", [JstDateTime.ofJstUnsafe(2026, 6, 24, 13, 0)]));

    const page = await repo.list({ status: "Pending" }, { page: 1, size: 10 });
    expect(page.total).toBe(2);
    expect(page.items.length).toBe(2);

    const empty = await repo.list({ status: "Cancelled" }, { page: 1, size: 10 });
    expect(empty.total).toBe(0);
  });

  it("confirmedStartingBetween は範囲内の Confirmed のみ返す", async () => {
    const a = pendingOn("cust-a");
    await repo.save(a);
    unwrap(a.confirm(now));
    await repo.save(a);

    const inRange = await repo.confirmedStartingBetween(
      JstDateTime.ofJstUnsafe(2026, 6, 24, 0, 0),
      JstDateTime.ofJstUnsafe(2026, 6, 25, 0, 0),
    );
    expect(inRange.length).toBe(1);

    const outRange = await repo.confirmedStartingBetween(
      JstDateTime.ofJstUnsafe(2026, 6, 25, 0, 0),
      JstDateTime.ofJstUnsafe(2026, 6, 26, 0, 0),
    );
    expect(outRange.length).toBe(0);
  });
});
