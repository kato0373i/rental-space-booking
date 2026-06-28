import { describe, expect, it } from "vitest";
import { Money } from "../../../shared/domain/Money.js";
import {
  StripePaymentAdapter,
  type StripeChargeResult,
  type StripeGateway,
  type StripeRefundResult,
} from "./StripePaymentAdapter.js";

class FakeStripeGateway implements StripeGateway {
  lastCharge?: { idempotencyKey: string; amountJpy: number; reservationId: string };
  lastRefund?: { idempotencyKey: string; amountJpy: number };
  constructor(
    private readonly chargeResult: StripeChargeResult,
    private readonly refundResult: StripeRefundResult = { status: "succeeded" },
  ) {}
  async createCharge(params: {
    idempotencyKey: string;
    amountJpy: number;
    reservationId: string;
  }): Promise<StripeChargeResult> {
    this.lastCharge = params;
    return this.chargeResult;
  }
  async createRefund(params: {
    idempotencyKey: string;
    amountJpy: number;
  }): Promise<StripeRefundResult> {
    this.lastRefund = params;
    return this.refundResult;
  }
}

describe("StripePaymentAdapter（外部決済プロバイダ実装, #14）", () => {
  it("与信成功は Succeeded を返し、冪等キー＝予約IDを metadata に載せる", async () => {
    const gw = new FakeStripeGateway({ status: "succeeded" });
    const adapter = new StripePaymentAdapter(gw);
    const outcome = await adapter.charge("rsv-1", Money.ofUnsafe(2000));
    expect(outcome.kind).toBe("Succeeded");
    expect(gw.lastCharge).toEqual({ idempotencyKey: "rsv-1", amountJpy: 2000, reservationId: "rsv-1" });
  });

  it("カード拒否は Failed（理由付き）にマッピングする", async () => {
    const adapter = new StripePaymentAdapter(
      new FakeStripeGateway({ status: "failed", reason: "card_declined" }),
    );
    const outcome = await adapter.charge("rsv-2", Money.ofUnsafe(1000));
    expect(outcome.kind).toBe("Failed");
    if (outcome.kind === "Failed") expect(outcome.reason).toBe("card_declined");
  });

  it("プロバイダ無応答は TimedOut にマッピングする", async () => {
    const adapter = new StripePaymentAdapter(new FakeStripeGateway({ status: "timeout" }));
    const outcome = await adapter.charge("rsv-3", Money.ofUnsafe(1000));
    expect(outcome.kind).toBe("TimedOut");
  });

  it("返金成功/失敗をマッピングする", async () => {
    const ok = new StripePaymentAdapter(
      new FakeStripeGateway({ status: "succeeded" }, { status: "succeeded" }),
    );
    expect((await ok.refund("rsv-4", Money.ofUnsafe(500))).kind).toBe("Refunded");

    const ng = new StripePaymentAdapter(
      new FakeStripeGateway({ status: "succeeded" }, { status: "failed", reason: "already_refunded" }),
    );
    expect((await ng.refund("rsv-4", Money.ofUnsafe(500))).kind).toBe("Failed");
  });
});
