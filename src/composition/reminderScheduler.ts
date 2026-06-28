import { Scope } from "@aws-blocks/core";
import { CronJob } from "@aws-blocks/blocks";
import type { Container } from "./container.js";

/**
 * リマインド自動実行（#12, FR-032 / U-03）。
 *
 * 手動トリガ（UI / デモの `triggerReminders()`）に依存せず、Scheduled tasks Block（cron）で
 * `TriggerReminders` を定期起動する。二重送信は `ReminderLog`（冪等）が防ぐため、cron の
 * at-least-once・反復起動でも安全（ADR-AB08）。
 */

/** cron の既定スケジュール。利用開始24h前付近を取りこぼさない粒度で起動する。 */
export const DEFAULT_REMINDER_SCHEDULE = "rate(5 minutes)";

/**
 * リマインドを1サイクル実行する（cron ハンドラの本体）。現在時刻を基準に対象を抽出・送信し、
 * 送信件数を返す。タイマーに依存せず単体で呼べるため、テスト・手動実行・cron から共通利用する。
 */
export async function runReminderCycle(container: Container): Promise<{ readonly sent: number }> {
  return container.triggerReminders.execute({ referenceTime: container.clock.now() });
}

/**
 * リマインドの定期ジョブを構築・起動する（Scheduled tasks Block）。
 * デプロイ/ローカル開発の実行エントリから呼ぶ。テストではタイマーを起動させないため呼ばない
 * （冪等ロジックは {@link runReminderCycle} 経由で検証する）。
 */
export function startReminderCron(
  container: Container,
  options: { readonly scope?: Scope; readonly schedule?: string; readonly enabled?: boolean } = {},
): CronJob {
  const scope = options.scope ?? new Scope("rental-space-booking");
  return new CronJob(scope, "reminders", {
    schedule: options.schedule ?? DEFAULT_REMINDER_SCHEDULE,
    description: "利用開始24時間前の Confirmed 予約へリマインドを送る（#12, FR-032）",
    // 既定で起動。テストや「手動トリガのみ」運用では enabled:false でタイマーを止められる。
    enabled: options.enabled ?? true,
    handler: async (event) => {
      const { sent } = await runReminderCycle(container);
      // 観測用ログ（PII は含めない, NFR-002）。
      console.info(`[リマインドcron] ${event.scheduledTime} 実行 送信=${sent}件`);
    },
  });
}
