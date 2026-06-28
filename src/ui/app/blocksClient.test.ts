import { describe, expect, it, vi } from "vitest";
import { createBlocksAppServices, type AdminRpc, type BookingRpc } from "./blocksClient.js";

/** 既定で成功を返す予約 RPC の fake（必要なメソッドだけ上書きする）。 */
const fakeBooking = (over: Partial<BookingRpc> = {}): BookingRpc => ({
  listSpaces: async () => [],
  searchAvailability: async () => ({ ok: true, value: [] }),
  quote: async () => ({ ok: true, value: 1000 }),
  place: async () => ({ ok: true, value: { reservationId: "r1", reservationNumber: "RSV-1", priceJpy: 1000 } }),
  lookup: async () => ({ ok: false, error: { kind: "NotFound", message: "なし" } }),
  cancel: async () => ({ ok: true, value: { feeJpy: 0, refundJpy: 1000, ratePct: 0 } }),
  listMyReservations: async () => [],
  registerMember: async () => ({ ok: true, value: { customerId: "c1" } }),
  login: async () => ({ ok: true, value: { customerId: "c1", role: "Member" } }),
  triggerReminders: async () => 0,
  ...over,
});

const fakeAdmin = (over: Partial<AdminRpc> = {}): AdminRpc => ({
  listSpaces: async () => [],
  getSpaceDetail: async () => ({ ok: false, error: { kind: "NotFound", message: "なし" } }),
  registerSpace: async () => ({ ok: true, value: { spaceId: "s1" } }),
  editSpace: async () => ({ ok: true, value: undefined }),
  suspendSpace: async () => ({ ok: true, value: undefined }),
  resumeSpace: async () => ({ ok: true, value: undefined }),
  listReservations: async () => ({ ok: true, value: { items: [], total: 0, page: 1, size: 20 } }),
  forceCancel: async () => ({ ok: true, value: { feeJpy: 0, refundJpy: 0, ratePct: 0 } }),
  markNoShow: async () => ({ ok: true, value: undefined }),
  ...over,
});

describe("createBlocksAppServices（型安全クライアント→AppServices 適合, #15）", () => {
  it("各メソッドを RPC へ委譲する（引数も透過）", async () => {
    const place = vi.fn(fakeBooking().place);
    const services = createBlocksAppServices({ app: fakeBooking({ place }), admin: fakeAdmin() });

    const r = await services.place({ spaceId: "s1", slotEpochs: [1], contact: { name: "a", email: "b@c.d", phone: "1" } });
    expect(r.ok).toBe(true);
    expect(place).toHaveBeenCalledWith({
      spaceId: "s1",
      slotEpochs: [1],
      contact: { name: "a", email: "b@c.d", phone: "1" },
    });
  });

  it("UiResult 系 RPC が例外を投げたら UiResult のエラーへ写像する", async () => {
    const services = createBlocksAppServices({
      app: fakeBooking({
        quote: async () => {
          throw new Error("network down");
        },
      }),
      admin: fakeAdmin(),
    });
    const r = await services.quote("s1", [1]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("IllegalState");
      expect(r.error.message).toContain("network down");
    }
  });

  it("管理者 RPC も委譲し、例外は UiResult エラーへ写像する", async () => {
    const services = createBlocksAppServices({
      app: fakeBooking(),
      admin: fakeAdmin({
        forceCancel: async () => {
          throw new Error("boom");
        },
      }),
    });
    const session = { customerId: "c1", role: "Admin" as const };
    const r = await services.admin.forceCancel(session, "r1", true);
    expect(r.ok).toBe(false);
  });

  it("setPaymentBehavior は実バックエンドでは no-op（例外を投げない）", () => {
    const services = createBlocksAppServices({ app: fakeBooking(), admin: fakeAdmin() });
    expect(() => services.setPaymentBehavior("Fail")).not.toThrow();
  });
});
