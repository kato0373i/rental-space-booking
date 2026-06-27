-- 予約コンテキストの永続化スキーマ（設計 docs/design/aws-blocks-async-ports.md §4）。
-- 配列/ポリシーは JSON 文字列として保持し、読み出し時に復元する。

CREATE TABLE IF NOT EXISTS reservations (
  id                  TEXT PRIMARY KEY,
  reservation_number  TEXT UNIQUE NOT NULL,
  space_id            TEXT NOT NULL,          -- 論理FK（ADR-009: 物理FKは張らない）
  customer_id         TEXT NOT NULL,          -- 論理FK
  slot_starts_epoch   TEXT NOT NULL,          -- JSON: number[]（占有スロット開始epoch）
  first_slot_epoch    BIGINT NOT NULL,        -- slot_starts_epoch[0]（範囲フィルタ/並びの導出列）
  slot_minutes        INTEGER NOT NULL,
  status              TEXT NOT NULL,          -- Pending/Confirmed/Cancelled/NoShow/Aborted
  confirmed_price_jpy INTEGER NOT NULL CHECK (confirmed_price_jpy >= 0),  -- 確定時スナップショット(ADR-006)
  policy_tiers        TEXT NOT NULL,          -- JSON: CancellationTier[]（確定時スナップショット）
  payment_idem_key    TEXT NOT NULL,
  version             INTEGER NOT NULL,       -- 楽観ロック（状態遷移競合検出）
  created_at_epoch    BIGINT NOT NULL,
  confirmed_at_epoch  BIGINT,
  cancelled_by        TEXT
);

CREATE INDEX IF NOT EXISTS idx_reservations_customer        ON reservations (customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status_created  ON reservations (status, created_at_epoch DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_status_first    ON reservations (status, first_slot_epoch);

-- アクティブ占有テーブル（Pending/Confirmed のスロットのみを保持）。
-- 複合主キーがダブルブッキング不可を物理強制する（ADR-AB02/AB04, 既存 ADR-002/003 の物理実装）。
CREATE TABLE IF NOT EXISTS reservation_slots (
  space_id         TEXT NOT NULL,
  slot_start_epoch BIGINT NOT NULL,
  reservation_id   TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  PRIMARY KEY (space_id, slot_start_epoch)
);

CREATE INDEX IF NOT EXISTS idx_reservation_slots_reservation ON reservation_slots (reservation_id);
