import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../shared/domain/Clock.js";
import { CustomerId, ReservationId, SpaceId } from "../shared/domain/Id.js";
import { JstDateTime } from "../shared/domain/JstDateTime.js";
import { ADMIN, seed } from "./seed.js";
import { createContainer, type Container } from "./container.js";

const jst = (y: number, mo: number, d: number, h: number, mi = 0) =>
  JstDateTime.ofJstUnsafe(y, mo, d, h, mi);

const NOW = jst(2026, 6, 20, 9, 0);
const WED_10 = jst(2026, 6, 24, 10, 0);

let app: Container;
let spaceId: SpaceId;
let memberId: CustomerId;
let adminId: CustomerId;

beforeEach(() => {
  app = createContainer({ clock: new FixedClock(NOW), silentNotifications: true });
  const s = seed(app);
  spaceId = s.spaceId;
  memberId = s.memberId;
  adminId = s.adminId;
});

const placeForMember = async () => {
  const r = await app.placeReservation.execute({ spaceId, slotStarts: [WED_10], customerId: memberId });
  if (!r.ok) throw new Error("place failed");
  return r.value;
};

describe("管理者ログイン（B-1, FR-042）", () => {
  it("管理者アカウントは Admin ロールで返る", () => {
    const r = app.loginMock.execute({ loginId: "admin", secret: "admin123" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.role).toBe("Admin");
    expect(r.value.customerId).toBe(adminId);
  });

  it("一般会員は Member ロール", () => {
    const r = app.loginMock.execute({ loginId: "taro", secret: "password" });
    expect(r.ok && r.value.role).toBe("Member");
  });
});

describe("スペース一覧/詳細（B-2/B-3, FR-AD03/AD04）", () => {
  it("includeSuspended で公開停止も含む", () => {
    app.suspendSpace.execute(ADMIN, { spaceId });
    expect(app.listSpaces.execute().length).toBe(1); // 公開中のみ
    const all = app.listSpaces.execute(true);
    expect(all.length).toBe(2);
    expect(all.find((s) => s.spaceId === spaceId)?.publishState).toBe("Suspended");
  });

  it("GetSpaceDetail が全設定を返す", () => {
    const r = app.getSpaceDetail.execute(spaceId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rateRules.length).toBe(3);
    expect(r.value.cancellationTiers.length).toBe(2);
    expect(r.value.publishState).toBe("Published");
  });
});

describe("全予約一覧の期間フィルタ（B-4, FR-AD05）", () => {
  it("利用開始が範囲内の予約のみ返る", async () => {
    await placeForMember();
    const inRange = await app.listAllReservations.execute(ADMIN, {
      fromInclusive: jst(2026, 6, 24, 0, 0),
      toExclusive: jst(2026, 6, 25, 0, 0),
    });
    expect(inRange.ok && inRange.value.total).toBe(1);

    const outRange = await app.listAllReservations.execute(ADMIN, {
      fromInclusive: jst(2026, 6, 25, 0, 0),
      toExclusive: jst(2026, 6, 26, 0, 0),
    });
    expect(outRange.ok && outRange.value.total).toBe(0);
  });

  it("非管理者は ForbiddenError", async () => {
    const r = await app.listAllReservations.execute({ role: "Member", customerId: memberId }, {});
    expect(r.ok).toBe(false);
  });
});

describe("強制キャンセル 0%上書き（FR-AD06/FR-019）", () => {
  it("overrideZeroRate でキャンセル料0・全額返金", async () => {
    const placed = await placeForMember();
    const r = await app.forceCancelReservation.execute(ADMIN, {
      reservationId: ReservationId.of(placed.reservationId),
      overrideZeroRate: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.feeJpy).toBe(0);
    expect(r.value.refundJpy).toBe(placed.priceJpy);
  });
});
