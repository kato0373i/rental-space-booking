import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../../../shared/domain/Clock.js";
import { ReservationId, SpaceId } from "../../../shared/domain/Id.js";
import { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import { Money } from "../../../shared/domain/Money.js";
import type { Actor } from "../../../shared/auth.js";
import { createContainer, type Container } from "../../../composition/container.js";
import { ADMIN, seed } from "../../../composition/seed.js";
import type { SpaceInput } from "../../space/application/spaceFactory.js";

const jst = (y: number, mo: number, d: number, h: number, mi = 0) =>
  JstDateTime.ofJstUnsafe(y, mo, d, h, mi);

const NOW = jst(2026, 6, 20, 9, 0);
// 2026-06-24（水・平日）/ 2026-06-27（土）
const WED_10 = jst(2026, 6, 24, 10, 0);
const WED_11 = jst(2026, 6, 24, 11, 0);
const WED_DAY = jst(2026, 6, 24, 0, 0);
const SAT_10 = jst(2026, 6, 27, 10, 0);
const SAT_11 = jst(2026, 6, 27, 11, 0);

const GUEST: Actor = { role: "Guest" };

/**
 * 通知は結果整合の fire-and-forget で、宛先（マスク済み）解決が async になった（ADR-AB06/AB07）。
 * 送信完了は次のマクロタスクまでに揃うため、件数アサーション前に保留タスクを排出する。
 */
const flushNotifications = () => new Promise((resolve) => setTimeout(resolve, 0));

const guestContact = (email = "hanako@example.com") => ({
  name: "佐藤花子",
  email,
  phone: "080-1111-2222",
});

let app: Container;
let clock: FixedClock;
let spaceId: SpaceId;

beforeEach(async () => {
  clock = new FixedClock(NOW);
  app = createContainer({ clock, silentNotifications: true });
  spaceId = (await seed(app)).spaceId;
});

const place = (slots: JstDateTime[], email?: string) =>
  app.placeReservation.execute({ spaceId, slotStarts: slots, contact: guestContact(email) });

describe("FR-010 空き枠照会", () => {
  it("確定予約のあるスロットは空きから除外される", async () => {
    const before = await app.searchAvailability.execute({ spaceId, fromDay: WED_DAY, toDay: WED_DAY });
    expect(before.ok && before.value.freeSlots.length).toBe(9);

    await place([WED_10, WED_11]);

    const after = await app.searchAvailability.execute({ spaceId, fromDay: WED_DAY, toDay: WED_DAY });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.freeSlots.length).toBe(7);
    expect(after.value.freeSlots).not.toContain(WED_10.toIsoJst());
  });

  it("空きが1件もなくてもエラーにならず空配列を返す", async () => {
    // maxSlots=8 のため 2 予約に分けて全9スロット（09:00〜17:00開始）を埋める
    const first8 = Array.from({ length: 8 }, (_, i) => jst(2026, 6, 24, 9 + i, 0));
    const r1 = await place(first8, "a@example.com");
    expect(r1.ok).toBe(true);
    const r2 = await place([jst(2026, 6, 24, 17, 0)], "b@example.com");
    expect(r2.ok).toBe(true);

    const result = await app.searchAvailability.execute({ spaceId, fromDay: WED_DAY, toDay: WED_DAY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.freeSlots).toEqual([]);
  });
});

describe("FR-011 見積もり", () => {
  it("複数スロットの合計を見積もる（平日1000×2=2000）", async () => {
    const q = await app.quoteReservation.execute({ spaceId, slotStarts: [WED_10, WED_11] });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.value.amount).toBe(2000);
  });
});

describe("FR-012 予約作成（決済成功で確定）", () => {
  it("決済成功で確定し予約番号と確定通知が発行される", async () => {
    const r = await place([WED_10, WED_11]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.reservationNumber).toMatch(/^RSV-/);
    expect(r.value.priceJpy).toBe(2000);
    await flushNotifications();
    expect(app.notifier.sentOfKind("Confirmed").length).toBe(1);
  });

  it("決済失敗で予約は成立せず占有スロットが解放される", async () => {
    app.payment.setBehavior("Fail");
    const r = await place([WED_10, WED_11]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("PaymentFailed");

    // スロットが解放されている
    const avail = await app.searchAvailability.execute({ spaceId, fromDay: WED_DAY, toDay: WED_DAY });
    expect(avail.ok && avail.value.freeSlots.length).toBe(9);

    // Aborted 終端で残る（ADR-005）
    const list = await app.listAllReservations.execute(ADMIN, { status: "Aborted" });
    expect(list.ok && list.value.total).toBe(1);
  });

  it("決済タイムアウトでも在庫が宙に浮かず解放される", async () => {
    app.payment.setBehavior("Timeout");
    const r = await place([WED_10, WED_11]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("PaymentFailed");
    if (r.error.kind === "PaymentFailed") expect(r.error.reason).toBe("TimedOut");
    const avail = await app.searchAvailability.execute({ spaceId, fromDay: WED_DAY, toDay: WED_DAY });
    expect(avail.ok && avail.value.freeSlots.length).toBe(9);
  });
});

describe("FR-013 ダブルブッキング防止", () => {
  it("同一スロットへの競合予約は後勝ちを拒否する", async () => {
    const first = await place([WED_10, WED_11], "a@example.com");
    expect(first.ok).toBe(true);

    const second = await place([WED_10], "b@example.com");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe("ConflictError");
  });

  it("部分的に重なるスロットも競合になる", async () => {
    await place([WED_10, WED_11], "a@example.com");
    const overlap = await place([WED_11], "b@example.com"); // 11:00 が重複
    expect(overlap.ok).toBe(false);
  });
});

describe("FR-014 予約ルール検証", () => {
  it("非連続スロットは予約できない", async () => {
    const s10 = jst(2026, 6, 24, 10, 0);
    const s13 = jst(2026, 6, 24, 13, 0); // 間に空白
    const r = await place([s10, s13]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("ValidationError");
  });

  it("過去日時は予約不可", async () => {
    const past = jst(2026, 6, 19, 10, 0); // NOW(20日)より過去
    const r = await place([past]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("ValidationError");
  });

  it("予約可能上限（30日）を超える日時は予約不可", async () => {
    const far = jst(2026, 8, 1, 10, 0); // 40日以上先
    const r = await place([far]);
    expect(r.ok).toBe(false);
  });

  it("最小スロット数を下回ると予約不可", async () => {
    // 最小2スロットの専用スペースを登録
    const input: SpaceInput = {
      name: "min2",
      capacity: 4,
      openHour: 9,
      openMinute: 0,
      closeHour: 18,
      closeMinute: 0,
      slotMinutes: 60,
      minSlots: 2,
      maxSlots: 8,
      bookableHorizonDays: 30,
      rateRules: [
        { dayKind: "Weekday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 1000 },
        { dayKind: "Saturday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 2000 },
        { dayKind: "Sunday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 2000 },
      ],
      cancellationTiers: [{ hoursBefore: 0, feeRatePct: 50 }],
    };
    const reg = await app.registerSpace.execute(ADMIN, input);
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    const min2Space = SpaceId.of(reg.value.spaceId);

    const r = await app.placeReservation.execute({
      spaceId: min2Space,
      slotStarts: [WED_10], // 1スロットのみ
      contact: guestContact(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("ValidationError");
  });
});

describe("FR-015 キャンセル（締切＋料率＋返金）", () => {
  it("無料キャンセル期間内（48h超）は全額返金", async () => {
    const r = await place([SAT_10, SAT_11], "x@example.com"); // 土曜2000×2=4000
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // NOW(6/20 09:00) → 利用開始(6/27 10:00) は 48h 超
    const c = await app.cancelReservation.execute({
      reservationId: ReservationId.of(r.value.reservationId),
      email: "x@example.com",
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.value.ratePct).toBe(0);
    expect(c.value.refundJpy).toBe(4000);
  });

  it("キャンセル料が発生する期間（24h前は50%）", async () => {
    const r = await place([SAT_10, SAT_11], "x@example.com"); // 4000
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    clock.set(jst(2026, 6, 26, 10, 0)); // 利用開始の24h前
    const c = await app.cancelReservation.execute({
      reservationId: ReservationId.of(r.value.reservationId),
      email: "x@example.com",
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.value.ratePct).toBe(50);
    expect(c.value.feeJpy).toBe(2000);
    expect(c.value.refundJpy).toBe(2000);
  });

  it("利用終了後（Completed導出）はキャンセル不可（IllegalState）", async () => {
    const r = await place([WED_10, WED_11]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    clock.set(jst(2026, 6, 24, 13, 0)); // 利用終了(12:00)後
    const c = await app.cancelReservation.execute({
      reservationId: ReservationId.of(r.value.reservationId),
      email: "hanako@example.com",
    });
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.error.kind).toBe("IllegalState");
  });

  it("キャンセル済み（終端）への再キャンセルは不可", async () => {
    const r = await place([WED_10, WED_11]);
    if (!r.ok) return;
    const id = ReservationId.of(r.value.reservationId);
    await app.cancelReservation.execute({ reservationId: id, email: "hanako@example.com" });
    const again = await app.cancelReservation.execute({ reservationId: id, email: "hanako@example.com" });
    expect(again.ok).toBe(false);
  });
});

describe("FR-016 予約照会", () => {
  it("予約番号＋メール一致で詳細が表示される", async () => {
    const r = await place([WED_10, WED_11]);
    if (!r.ok) return;
    const found = await app.lookupReservation.execute({
      reservationNumber: r.value.reservationNumber,
      email: "hanako@example.com",
    });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.priceJpy).toBe(2000);
    expect(found.value.status).toBe("Confirmed");
  });

  it("メール不一致は存在を秘匿して NotFound", async () => {
    const r = await place([WED_10, WED_11]);
    if (!r.ok) return;
    const found = await app.lookupReservation.execute({
      reservationNumber: r.value.reservationNumber,
      email: "wrong@example.com",
    });
    expect(found.ok).toBe(false);
    if (found.ok) return;
    expect(found.error.kind).toBe("NotFound");
  });
});

describe("FR-017 利用完了への遷移（導出）", () => {
  it("利用終了後は status が Completed として導出される", async () => {
    const r = await place([WED_10, WED_11]);
    if (!r.ok) return;
    clock.set(jst(2026, 6, 24, 13, 0));
    const found = await app.lookupReservation.execute({
      reservationNumber: r.value.reservationNumber,
      email: "hanako@example.com",
    });
    expect(found.ok && found.value.status).toBe("Completed");
  });
});

describe("FR-018 ノーショー判定（管理者手動）", () => {
  it("利用終了後に管理者がノーショーをマークできる", async () => {
    const r = await place([WED_10, WED_11]);
    if (!r.ok) return;
    const id = ReservationId.of(r.value.reservationId);
    clock.set(jst(2026, 6, 24, 13, 0));
    const marked = await app.markNoShow.execute(ADMIN, { reservationId: id });
    expect(marked.ok).toBe(true);
    const list = await app.listAllReservations.execute(ADMIN, { status: "NoShow" });
    expect(list.ok && list.value.total).toBe(1);
  });

  it("利用終了前はノーショーにできない", async () => {
    const r = await place([WED_10, WED_11]);
    if (!r.ok) return;
    const marked = await app.markNoShow.execute(ADMIN, {
      reservationId: ReservationId.of(r.value.reservationId),
    });
    expect(marked.ok).toBe(false);
  });
});

describe("FR-019 管理者の強制キャンセル / U-06 料率0%上書き", () => {
  it("強制キャンセルは管理者起因で記録され、料率0%上書きで全額返金できる", async () => {
    const r = await place([SAT_10, SAT_11], "x@example.com"); // 4000
    if (!r.ok) return;
    clock.set(jst(2026, 6, 26, 10, 0)); // 通常は50%の期間
    const c = await app.forceCancelReservation.execute(ADMIN, {
      reservationId: ReservationId.of(r.value.reservationId),
      overrideZeroRate: true,
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.value.ratePct).toBe(0);
    expect(c.value.refundJpy).toBe(4000);
  });
});

describe("FR-020 決済の冪等性", () => {
  it("同一冪等キーの二重送信でも与信は1回", async () => {
    const key = "idem-key-1";
    const amount = Money.ofUnsafe(2000);
    const first = await app.payment.charge(key, amount);
    const second = await app.payment.charge(key, amount);
    expect(first.kind).toBe("Succeeded");
    expect(second.kind).toBe("Succeeded");
    expect(app.payment.appliedChargeCount(key)).toBe(1);
  });
});

describe("FR-021 返金（部分返金）", () => {
  it("確定額からキャンセル料を差し引いた額が返金される", async () => {
    const r = await place([SAT_10, SAT_11], "x@example.com"); // 4000
    if (!r.ok) return;
    const id = r.value.reservationId;
    clock.set(jst(2026, 6, 26, 10, 0)); // 50%
    await app.cancelReservation.execute({
      reservationId: ReservationId.of(id),
      email: "x@example.com",
    });
    expect(app.payment.refundedTotal(id)).toBe(2000);
  });
});

describe("FR-003 公開停止", () => {
  it("公開停止中のスペースは新規予約不可・既存予約は維持される", async () => {
    const r = await place([WED_10, WED_11]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const suspended = await app.suspendSpace.execute(ADMIN, { spaceId });
    expect(suspended.ok).toBe(true);

    // 新規予約は受け付けない
    const blocked = await place([jst(2026, 6, 24, 14, 0)], "y@example.com");
    expect(blocked.ok).toBe(false);

    // 既存の確定予約はキャンセル可能なまま
    const c = await app.cancelReservation.execute({
      reservationId: ReservationId.of(r.value.reservationId),
      email: "hanako@example.com",
    });
    expect(c.ok).toBe(true);
  });
});

describe("FR-032 リマインド", () => {
  it("利用24時間前のトリガで確定予約にリマインドが送られる", async () => {
    const r = await place([WED_10, WED_11]);
    if (!r.ok) return;
    app.notifier.clear();
    const reminded = await app.triggerReminders.execute({
      referenceTime: jst(2026, 6, 23, 10, 0), // 開始の24h前
    });
    expect(reminded.sent).toBe(1);
    await flushNotifications();
    expect(app.notifier.sentOfKind("Reminder").length).toBe(1);
  });

  it("キャンセル済みにはリマインドが送られない", async () => {
    const r = await place([WED_10, WED_11]);
    if (!r.ok) return;
    await app.cancelReservation.execute({
      reservationId: ReservationId.of(r.value.reservationId),
      email: "hanako@example.com",
    });
    app.notifier.clear();
    const reminded = await app.triggerReminders.execute({
      referenceTime: jst(2026, 6, 23, 10, 0),
    });
    expect(reminded.sent).toBe(0);
  });
});

describe("FR-042 認可", () => {
  it("ゲストはスペース登録できない", async () => {
    const reg = await app.registerSpace.execute(GUEST, {
      name: "x",
      capacity: 1,
      openHour: 9,
      openMinute: 0,
      closeHour: 10,
      closeMinute: 0,
      slotMinutes: 60,
      minSlots: 1,
      maxSlots: 1,
      bookableHorizonDays: 1,
      rateRules: [],
      cancellationTiers: [{ hoursBefore: 0, feeRatePct: 0 }],
    });
    expect(reg.ok).toBe(false);
    if (reg.ok) return;
    expect(reg.error.kind).toBe("ForbiddenError");
  });

  it("ゲストは強制キャンセルできない", async () => {
    const r = await place([WED_10, WED_11]);
    if (!r.ok) return;
    const c = await app.forceCancelReservation.execute(GUEST, {
      reservationId: ReservationId.of(r.value.reservationId),
    });
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.error.kind).toBe("ForbiddenError");
  });
});
