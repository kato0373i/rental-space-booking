import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../../../shared/domain/Clock.js";
import type { DomainEvent } from "../../../shared/domain/DomainEvent.js";
import type { EventBus, EventHandler } from "../../../shared/domain/EventBus.js";
import { CustomerId, ReservationId, SpaceId } from "../../../shared/domain/Id.js";
import { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import { Money } from "../../../shared/domain/Money.js";
import { unwrap } from "../../../shared/domain/Result.js";
import { CancellationPolicy } from "../domain/CancellationPolicy.js";
import { Reservation } from "../domain/Reservation.js";
import { SlottedPeriod } from "../domain/SlottedPeriod.js";
import { InMemoryReservationRepository } from "../infrastructure/InMemoryReservationRepository.js";
import { SettleReservationPayment } from "./SettleReservationPayment.js";

const now = JstDateTime.ofJstUnsafe(2026, 6, 20, 9, 0);
const slot10 = JstDateTime.ofJstUnsafe(2026, 6, 24, 10, 0);

/** 発火イベントを記録するだけの EventBus。 */
class RecordingBus implements EventBus {
  readonly published: DomainEvent[] = [];
  publish(event: DomainEvent): void {
    this.published.push(event);
  }
  subscribe(_type: string, _handler: EventHandler): void {}
}

const pending = (): Reservation =>
  Reservation.pending({
    spaceId: SpaceId.of("space-1"),
    customerId: CustomerId.of("cust-1"),
    period: unwrap(SlottedPeriod.of([slot10], 60)),
    price: Money.ofUnsafe(2000),
    policy: unwrap(CancellationPolicy.fromSnapshot([{ hoursBefore: 0, feeRatePct: 50 }])),
    now,
  });

let repo: InMemoryReservationRepository;
let bus: RecordingBus;
let settle: SettleReservationPayment;

beforeEach(() => {
  repo = new InMemoryReservationRepository();
  bus = new RecordingBus();
  settle = new SettleReservationPayment(repo, bus, new FixedClock(now));
});

describe("SettleReservationPayment（#14, 冪等な決済決着, ADR-AB10）", () => {
  it("成功の決着で Pending → Confirmed になり ReservationConfirmed を発火する", async () => {
    const r = pending();
    await repo.save(r);

    const result = await settle.execute({ reservationId: r.id, outcome: { kind: "Succeeded" } });
    expect(result.ok && result.value.status).toBe("Confirmed");
    expect((await repo.byId(r.id))?.status).toBe("Confirmed");
    expect(bus.published.map((e) => e.type)).toEqual(["ReservationConfirmed"]);
  });

  it("失敗の決着で Pending → Aborted になり ReservationAborted を発火する", async () => {
    const r = pending();
    await repo.save(r);

    const result = await settle.execute({
      reservationId: r.id,
      outcome: { kind: "Failed", reason: "card_declined" },
    });
    expect(result.ok && result.value.status).toBe("Aborted");
    expect(bus.published.map((e) => e.type)).toEqual(["ReservationAborted"]);
  });

  it("タイムアウトの決着でも Aborted（占有解放）になる", async () => {
    const r = pending();
    await repo.save(r);
    const result = await settle.execute({ reservationId: r.id, outcome: { kind: "TimedOut" } });
    expect(result.ok && result.value.status).toBe("Aborted");
  });

  it("すでに Confirmed なら再決着は冪等な no-op（Webhook 再送・同期確定との二重適用を吸収）", async () => {
    const r = pending();
    await repo.save(r);
    await settle.execute({ reservationId: r.id, outcome: { kind: "Succeeded" } });
    bus.published.length = 0;

    // 同じ決着が再度届いても状態は変わらず、イベントも再発火しない。
    const again = await settle.execute({ reservationId: r.id, outcome: { kind: "Succeeded" } });
    expect(again.ok && again.value.status).toBe("Confirmed");
    expect(bus.published).toHaveLength(0);

    // 確定後に遅れて届いた失敗 Webhook でも Confirmed のまま（後勝ちさせない）。
    const lateFail = await settle.execute({
      reservationId: r.id,
      outcome: { kind: "Failed", reason: "late" },
    });
    expect(lateFail.ok && lateFail.value.status).toBe("Confirmed");
  });

  it("未知の予約は NotFound（Webhook 先着の再試行対象）", async () => {
    const result = await settle.execute({
      reservationId: ReservationId.of("missing"),
      outcome: { kind: "Succeeded" },
    });
    expect(result.ok).toBe(false);
  });
});
