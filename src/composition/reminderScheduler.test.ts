import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../shared/domain/Clock.js";
import { SpaceId } from "../shared/domain/Id.js";
import { JstDateTime } from "../shared/domain/JstDateTime.js";
import { createContainer, type Container } from "./container.js";
import { seed } from "./seed.js";
import { CronJob } from "@aws-blocks/blocks";
import { Scope } from "@aws-blocks/core";
import { randomUUID } from "node:crypto";
import { runReminderCycle, startReminderCron, DEFAULT_REMINDER_SCHEDULE } from "./reminderScheduler.js";

const jst = (y: number, mo: number, d: number, h: number, mi = 0) =>
  JstDateTime.ofJstUnsafe(y, mo, d, h, mi);

// 「今」を利用開始の24時間前に固定し、cron が現在時刻基準で対象を拾えることを検証する。
const NOW = jst(2026, 6, 23, 10, 0);
const START = jst(2026, 6, 24, 10, 0); // 24時間後の利用開始（Confirmed 対象）

const flushNotifications = () => new Promise((resolve) => setTimeout(resolve, 0));

let app: Container;
let spaceId: SpaceId;

beforeEach(async () => {
  app = createContainer({ clock: new FixedClock(NOW), silentNotifications: true });
  spaceId = (await seed(app)).spaceId;

  // 24時間後に開始する Confirmed 予約を1件用意する（決済成功で確定）。
  const placed = await app.placeReservation.execute({
    spaceId,
    slotStarts: [START],
    contact: { name: "佐藤花子", email: "hanako@example.com", phone: "080-1111-2222" },
  });
  if (!placed.ok) throw new Error(`予約作成に失敗: ${JSON.stringify(placed.error)}`);
});

describe("リマインド自動実行（#12, FR-032 / U-03）", () => {
  it("現在時刻基準のサイクルで24時間前の Confirmed 予約へ自動送信する（手動トリガ不要）", async () => {
    const { sent } = await runReminderCycle(app);
    expect(sent).toBe(1);
    await flushNotifications();
    expect(app.notifier.sentOfKind("Reminder").length).toBe(1);
  });

  it("サイクルを繰り返しても二重送信しない（冪等, cron の反復起動に対応）", async () => {
    const first = await runReminderCycle(app);
    expect(first.sent).toBe(1);

    // cron が同一窓で再起動しても、既送信分はスキップされる。
    const second = await runReminderCycle(app);
    const third = await runReminderCycle(app);
    expect(second.sent).toBe(0);
    expect(third.sent).toBe(0);

    await flushNotifications();
    expect(app.notifier.sentOfKind("Reminder").length).toBe(1);
  });

  it("Scheduled tasks Block の定期ジョブを構築できる（タイマー無効で検証）", () => {
    // enabled:false でタイマーを起動せず、ジョブ定義（CronJob）が成立することのみ確認する。
    const job = startReminderCron(app, {
      scope: new Scope(`test-cron-${randomUUID()}`),
      schedule: DEFAULT_REMINDER_SCHEDULE,
      enabled: false,
    });
    expect(job).toBeInstanceOf(CronJob);
  });
});
