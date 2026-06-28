import { describe, expect, it } from "vitest";
import type { PaymentSettlement } from "../../booking/application/SettleReservationPayment.js";
import {
  StripeWebhookProcessor,
  type StripeWebhookEvent,
  type StripeWebhookVerifier,
} from "./StripeWebhookProcessor.js";

class FakeVerifier implements StripeWebhookVerifier {
  constructor(private readonly event: StripeWebhookEvent | "invalid") {}
  constructEvent(): StripeWebhookEvent {
    if (this.event === "invalid") throw new Error("signature mismatch");
    return this.event;
  }
}

const collector = () => {
  const dispatched: PaymentSettlement[] = [];
  return { dispatched, dispatch: (s: PaymentSettlement) => dispatched.push(s) };
};

describe("StripeWebhookProcessor（#14, ADR-AB10）", () => {
  it("payment_intent.succeeded を Succeeded の決着として投入する", () => {
    const c = collector();
    const p = new StripeWebhookProcessor(
      new FakeVerifier({ type: "payment_intent.succeeded", reservationId: "rsv-1" }),
      c.dispatch,
    );
    const r = p.handle("{...}", "sig");
    expect(r.ok && r.value.handled).toBe(true);
    expect(c.dispatched).toHaveLength(1);
    expect(c.dispatched[0]?.reservationId).toBe("rsv-1");
    expect(c.dispatched[0]?.outcome.kind).toBe("Succeeded");
  });

  it("payment_intent.payment_failed を Failed の決着として投入する", () => {
    const c = collector();
    const p = new StripeWebhookProcessor(
      new FakeVerifier({
        type: "payment_intent.payment_failed",
        reservationId: "rsv-2",
        reason: "card_declined",
      }),
      c.dispatch,
    );
    p.handle("{...}", "sig");
    expect(c.dispatched[0]?.outcome).toEqual({ kind: "Failed", reason: "card_declined" });
  });

  it("署名検証に失敗したら投入せず ValidationError（生エラーは載せない）", () => {
    const c = collector();
    const p = new StripeWebhookProcessor(new FakeVerifier("invalid"), c.dispatch);
    const r = p.handle("{...}", "bad-sig");
    expect(r.ok).toBe(false);
    expect(c.dispatched).toHaveLength(0);
  });

  it("関心外イベントは投入せず handled=false（再送ループ回避）", () => {
    const c = collector();
    const p = new StripeWebhookProcessor(new FakeVerifier({ type: "other" }), c.dispatch);
    const r = p.handle("{...}", "sig");
    expect(r.ok && r.value.handled).toBe(false);
    expect(c.dispatched).toHaveLength(0);
  });
});
