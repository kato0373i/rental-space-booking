-- リマインド送信済みログ（#12, 二重送信防止 / 冪等性）。
-- Scheduled tasks Block（cron）は at-least-once かつ短間隔で繰り返し起動するため、
-- 予約ごとに「リマインドを送ったか」を1行で記録し、初回のみ送る主張を主キー制約で物理保証する。
CREATE TABLE IF NOT EXISTS sent_reminders (
  reservation_id TEXT PRIMARY KEY,                 -- 予約1件につき1回（FR-032 / U-03）
  sent_at_epoch  BIGINT NOT NULL DEFAULT 0         -- 送信記録時刻（運用観測用。判定には未使用）
);
