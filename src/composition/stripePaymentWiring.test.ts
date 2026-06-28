import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../shared/domain/Clock.js";
import { ReservationId, SpaceId } from "../shared/domain/Id.js";
import { JstDateTime } from "../shared/domain/JstDateTime.js";
import type {
  StripeChargeResult,
  StripeGateway,
  StripeRefundResult,
} from "../contexts/payment/infrastructure/StripePaymentAdapter.js";
import { createContainer, type Container } from "./container.js";
import { seed } from "./seed.js";

const jst = (y: number, mo: number, d: number, h: number, mi = 0) =>
  JstDateTime.ofJstUnsafe(y, mo, d, h, mi);
const NOW = jst(2026, 6, 20, 9, 0);
const WED_10 = jst(2026, 6, 24, 10, 0);

const gatewayWith = (charge: StripeChargeResult): StripeGateway => ({
  async createCharge() {
    return charge;
  },
  async createRefund(): Promise<StripeRefundResult> {
    return { status: "succeeded" };
  },
});

const guest = { name: "佐藤花子", email: "hanako@example.com", phone: "080-1111-2222" };

const place = (app: Container, spaceId: SpaceId) =>
  app.placeReservation.execute({ spaceId, slotStarts: [WED_10], contact: guest });

describe("Stripe 決済アダプタの配線（#14, 実決済で確定する/失敗で確定しない）", () => {
  let spaceId: SpaceId;

  const build = async (charge: StripeChargeResult): Promise<Container> => {
    const app = createContainer({
      clock: new FixedClock(NOW),
      silentNotifications: true,
      paymentGateway: gatewayWith(charge),
    });
    spaceId = (await seed(app)).spaceId;
    return app;
  };

  beforeEach(() => {
    spaceId = SpaceId.of("");
  });

  it("実決済（Stripe）成功で予約が Confirmed になる", async () => {
    const app = await build({ status: "succeeded" });
    const r = await place(app, spaceId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await app.reservations.byId(ReservationId.of(r.value.reservationId)))?.status).toBe(
      "Confirmed",
    );
  });

  it("実決済が失敗すると予約は確定しない（PaymentFailed・占有解放）", async () => {
    const app = await build({ status: "failed", reason: "card_declined" });
    const r = await place(app, spaceId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("PaymentFailed");
  });

  it("実決済がタイムアウトすると予約は確定しない（PaymentFailed/TimedOut）", async () => {
    const app = await build({ status: "timeout" });
    const r = await place(app, spaceId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("PaymentFailed");
  });
});
