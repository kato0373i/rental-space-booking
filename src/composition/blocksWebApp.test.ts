import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../shared/domain/Clock.js";
import { JstDateTime } from "../shared/domain/JstDateTime.js";
import { createWebApp, type AppServices } from "./webFacade.js";

const NOW = JstDateTime.ofJstUnsafe(2026, 6, 22, 9, 0);
const GUEST = { name: "佐藤花子", email: "hanako@example.com", phone: "080-1111-2222" };

/** 一意な scope で隔離した永続(blocks)バックエンドの AppServices を作る。 */
const buildBlocksApp = (scopeId: string): Promise<AppServices> =>
  createWebApp({ backend: "blocks", clock: new FixedClock(NOW), silentNotifications: true, blocksScopeId: scopeId });

let scopeId: string;
beforeEach(() => {
  scopeId = `test-web-${randomUUID()}`;
});

describe("AWS Blocks 永続バックエンド経由のフロー（#15, ADR-AB11）", () => {
  it("検索→見積→予約→確認→キャンセルを実バックエンドで完遂する", async () => {
    const app = await buildBlocksApp(scopeId);

    // シードされた公開スペース。
    const spaces = await app.listSpaces();
    expect(spaces.length).toBeGreaterThan(0);
    const spaceId = spaces[0]!.spaceId;

    // 検索 → 空きスロット取得。
    const avail = await app.searchAvailability(spaceId, "2026-06-24", "2026-06-25");
    expect(avail.ok).toBe(true);
    if (!avail.ok) return;
    const slot = avail.value[0]?.slots[0];
    expect(slot).toBeDefined();
    const epoch = slot!.epochMillis;

    // 見積。
    const quote = await app.quote(spaceId, [epoch]);
    expect(quote.ok && quote.value).toBeGreaterThan(0);

    // 予約（モック決済成功で Confirmed）。
    const placed = await app.place({ spaceId, slotEpochs: [epoch], contact: GUEST });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    // 確認（予約番号＋メールで照会）。
    const view = await app.lookup(placed.value.reservationNumber, GUEST.email);
    expect(view.ok && view.value.status).toBe("Confirmed");

    // キャンセル（48h 前なので無料）。
    const cancelled = await app.cancel(placed.value.reservationId, GUEST.email);
    expect(cancelled.ok).toBe(true);
  });

  it("リロード相当（同一 scope で再オープン）しても予約・占有・顧客プロフィールが保持される", async () => {
    const app1 = await buildBlocksApp(scopeId);
    const spacesBefore = await app1.listSpaces();
    const spaceId = spacesBefore[0]!.spaceId;
    const avail = await app1.searchAvailability(spaceId, "2026-06-24", "2026-06-25");
    if (!avail.ok) throw new Error("availability 取得失敗");
    const epoch = avail.value[0]!.slots[0]!.epochMillis;
    const placed = await app1.place({ spaceId, slotEpochs: [epoch], contact: GUEST });
    if (!placed.ok) throw new Error("place 失敗");

    // 別インスタンスで同じ永続 Database（同一 scope）を開く＝ブラウザのリロード相当。
    const app2 = await buildBlocksApp(scopeId);

    // スペースは再シードされず（冪等）件数が一致（Database 永続）。
    expect((await app2.listSpaces()).length).toBe(spacesBefore.length);

    // 予約済みスロットは別インスタンスでも空きに出ない＝占有（予約）が永続している。
    const reAvail = await app2.searchAvailability(spaceId, "2026-06-24", "2026-06-25");
    if (!reAvail.ok) throw new Error("availability 再取得失敗");
    const stillFree = reAvail.value[0]?.slots.some((s) => s.epochMillis === epoch) ?? false;
    expect(stillFree).toBe(false);

    // 顧客プロフィールも Database 永続化されたため（§9#5）、リロード跨ぎでも予約番号＋メール照会が成立する。
    const view = await app2.lookup(placed.value.reservationNumber, GUEST.email);
    expect(view.ok && view.value.status).toBe("Confirmed");
  });
});
