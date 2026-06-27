import { describe, expect, it } from "vitest";
import { CustomerId, SpaceId } from "../../../shared/domain/Id.js";
import { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import { Money } from "../../../shared/domain/Money.js";
import { unwrap } from "../../../shared/domain/Result.js";
import { CancellationPolicy } from "../domain/CancellationPolicy.js";
import { Reservation } from "../domain/Reservation.js";
import { SlottedPeriod } from "../domain/SlottedPeriod.js";
import { InMemoryReservationRepository } from "./InMemoryReservationRepository.js";

const now = JstDateTime.ofJstUnsafe(2026, 6, 20, 9, 0);
const slot = JstDateTime.ofJstUnsafe(2026, 6, 24, 10, 0);
const spaceId = SpaceId.of("space-1");
const policy = unwrap(CancellationPolicy.fromSnapshot([{ hoursBefore: 0, feeRatePct: 50 }]));

const pendingOn = (customer: string): Reservation =>
  Reservation.pending({
    spaceId,
    customerId: CustomerId.of(customer),
    period: unwrap(SlottedPeriod.of([slot], 60)),
    price: Money.ofUnsafe(1000),
    policy,
    now,
  });

describe("InMemoryReservationRepository（占有の check-and-set, ADR-002/003）", () => {
  it("Pending 作成と同時に占有を確保し、同一スロットの後続は ConflictError", async () => {
    const repo = new InMemoryReservationRepository();

    const a = pendingOn("cust-a");
    expect((await repo.save(a)).ok).toBe(true);

    const b = pendingOn("cust-b");
    const result = await repo.save(b);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("ConflictError");
  });

  it("Aborted への遷移を保存すると占有が解放され、再確保できる", async () => {
    const repo = new InMemoryReservationRepository();

    const a = pendingOn("cust-a");
    await repo.save(a);
    unwrap(a.abort("Failed", now)); // 解放
    expect((await repo.save(a)).ok).toBe(true);

    const b = pendingOn("cust-b");
    expect((await repo.save(b)).ok).toBe(true); // 解放後は確保できる
  });

  it("占有スロットは Pending/Confirmed のみが主張する", async () => {
    const repo = new InMemoryReservationRepository();
    const a = pendingOn("cust-a");
    await repo.save(a);

    const from = JstDateTime.ofJstUnsafe(2026, 6, 24, 0, 0);
    const to = from.addDays(1);
    expect((await repo.occupiedSlots(spaceId, from, to)).length).toBe(1);

    unwrap(a.abort("Failed", now));
    await repo.save(a);
    expect((await repo.occupiedSlots(spaceId, from, to)).length).toBe(0);
  });
});
