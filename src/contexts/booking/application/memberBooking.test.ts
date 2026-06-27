import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../../../shared/domain/Clock.js";
import { CustomerId, SpaceId } from "../../../shared/domain/Id.js";
import { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import { createContainer, type Container } from "../../../composition/container.js";
import { ADMIN, seed } from "../../../composition/seed.js";

const jst = (y: number, mo: number, d: number, h: number, mi = 0) =>
  JstDateTime.ofJstUnsafe(y, mo, d, h, mi);

const NOW = jst(2026, 6, 20, 9, 0);
const WED_10 = jst(2026, 6, 24, 10, 0);

let app: Container;
let spaceId: SpaceId;
let memberId: CustomerId;

beforeEach(async () => {
  const clock = new FixedClock(NOW);
  app = createContainer({ clock, silentNotifications: true });
  const s = await seed(app);
  spaceId = s.spaceId;
  memberId = s.memberId;
});

describe("会員予約の customerId 紐づけ（ADR-F02）", () => {
  it("ログイン会員の customerId で予約すると履歴に現れる", async () => {
    const login = app.loginMock.execute({ loginId: "taro", secret: "password" });
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    expect(login.value.customerId).toBe(memberId);

    const placed = await app.placeReservation.execute({
      spaceId,
      slotStarts: [WED_10],
      customerId: memberId,
    });
    expect(placed.ok).toBe(true);

    const history = await app.listMyReservations.execute(memberId);
    expect(history.length).toBe(1);
    expect(history[0]!.status).toBe("Confirmed");
  });

  it("存在しない customerId はバリデーションエラー", async () => {
    const placed = await app.placeReservation.execute({
      spaceId,
      slotStarts: [WED_10],
      customerId: CustomerId.of("does-not-exist"),
    });
    expect(placed.ok).toBe(false);
    if (placed.ok) return;
    expect(placed.error.kind).toBe("ValidationError");
  });

  it("連絡先も customerId も無ければバリデーションエラー", async () => {
    const placed = await app.placeReservation.execute({ spaceId, slotStarts: [WED_10] });
    expect(placed.ok).toBe(false);
    if (placed.ok) return;
    expect(placed.error.kind).toBe("ValidationError");
  });

  it("ゲスト予約（連絡先）は従来どおり成立する", async () => {
    const placed = await app.placeReservation.execute({
      spaceId,
      slotStarts: [WED_10],
      contact: { name: "ゲスト", email: "guest@example.com", phone: "090-0000-0000" },
    });
    expect(placed.ok).toBe(true);
  });
});

describe("ListSpaces（FR-F01）", () => {
  it("公開中スペースを一覧する", async () => {
    const spaces = await app.listSpaces.execute();
    expect(spaces.length).toBe(2); // 会議室A, スタジオB
    expect(spaces.map((s) => s.name)).toContain("会議室A");
  });

  it("公開停止したスペースは一覧に出ない", async () => {
    await app.suspendSpace.execute(ADMIN, { spaceId });
    const spaces = await app.listSpaces.execute();
    expect(spaces.length).toBe(1);
    expect(spaces.map((s) => s.name)).not.toContain("会議室A");
  });
});
