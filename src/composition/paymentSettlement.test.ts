import { randomUUID } from "node:crypto";
import { Scope } from "@aws-blocks/core";
import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../shared/domain/Clock.js";
import { CustomerId, ReservationId, SpaceId } from "../shared/domain/Id.js";
import { JstDateTime } from "../shared/domain/JstDateTime.js";
import { Money } from "../shared/domain/Money.js";
import { unwrap } from "../shared/domain/Result.js";
import { CancellationPolicy } from "../contexts/booking/domain/CancellationPolicy.js";
import { Reservation } from "../contexts/booking/domain/Reservation.js";
import { SlottedPeriod } from "../contexts/booking/domain/SlottedPeriod.js";
import type {
  StripeWebhookEvent,
  StripeWebhookVerifier,
} from "../contexts/payment/infrastructure/StripeWebhookProcessor.js";
import { createContainer, type Container } from "./container.js";
import { createPaymentSettlementJob, createStripeWebhookProcessor } from "./paymentSettlement.js";

const now = JstDateTime.ofJstUnsafe(2026, 6, 20, 9, 0);

const settleDelay = async (predicate: () => boolean, maxTicks = 100): Promise<void> => {
  for (let i = 0; i < maxTicks; i += 1) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
};

/** Pending 予約をリポジトリへ直接投入し、その ID を返す（Webhook 決着の対象を用意する）。 */
const givenPending = async (app: Container): Promise<ReservationId> => {
  const reservation = Reservation.pending({
    spaceId: SpaceId.of("space-1"),
    customerId: CustomerId.of("cust-1"),
    period: unwrap(SlottedPeriod.of([JstDateTime.ofJstUnsafe(2026, 6, 24, 10, 0)], 60)),
    price: Money.ofUnsafe(2000),
    policy: unwrap(CancellationPolicy.fromSnapshot([{ hoursBefore: 0, feeRatePct: 50 }])),
    now,
  });
  await app.reservations.save(reservation);
  return reservation.id;
};

let app: Container;
beforeEach(() => {
  app = createContainer({ clock: new FixedClock(now), silentNotifications: true });
});

describe("決済 Webhook → Background jobs オーケストレーション（#14, ADR-AB10）", () => {
  it("成功の決着ジョブを投入すると非同期で予約が Confirmed になる", async () => {
    const id = await givenPending(app);
    const job = createPaymentSettlementJob(app, { scope: new Scope(`test-pay-${randomUUID()}`) });

    await job.submit({ reservationId: id, outcome: { kind: "Succeeded" } });
    await settleDelay(() => job._queue.totalCompleted >= 1);

    expect((await app.reservations.byId(id))?.status).toBe("Confirmed");
    expect(job._queue.failed).toHaveLength(0);
  });

  it("Stripe Webhook 受信 → 署名検証 → ジョブ投入 → 予約 Confirmed まで通る", async () => {
    const id = await givenPending(app);
    const verifier: StripeWebhookVerifier = {
      constructEvent: (): StripeWebhookEvent => ({
        type: "payment_intent.succeeded",
        reservationId: id,
      }),
    };
    const processor = createStripeWebhookProcessor(app, verifier, {
      scope: new Scope(`test-pay-${randomUUID()}`),
    });

    const r = processor.handle("{...}", "sig");
    expect(r.ok && r.value.handled).toBe(true);

    // ワーカー（AsyncJob）が決着を反映するまでポーリングする。
    let status: string | undefined;
    for (let i = 0; i < 100 && status !== "Confirmed"; i += 1) {
      await new Promise((res) => setTimeout(res, 0));
      status = (await app.reservations.byId(id))?.status;
    }
    expect(status).toBe("Confirmed");
  });

  it("対象予約が存在しない決着はリトライ後 DLQ に送られる", async () => {
    const job = createPaymentSettlementJob(app, {
      scope: new Scope(`test-pay-${randomUUID()}`),
      maxRetries: 3,
    });
    await job.submit({ reservationId: ReservationId.of("ghost"), outcome: { kind: "Succeeded" } });
    await settleDelay(() => job._queue.failed.length >= 1);
    expect(job._queue.failed).toHaveLength(1);
    expect(job._queue.totalCompleted).toBe(0);
  });
});
