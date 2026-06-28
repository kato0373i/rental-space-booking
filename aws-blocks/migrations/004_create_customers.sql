-- 顧客プロフィール（連絡先）の永続化スキーマ（§9#5）。
-- 資格情報（パスワード等）は保持しない。認証・セッション・ロールは Authentication Block(Cognito) が所有する
-- （ADR-AB07）。本テーブルは PII プロフィールのみを持ち、予約照会・通知の宛先解決に用いる。
CREATE TABLE IF NOT EXISTS customers (
  id        TEXT PRIMARY KEY,
  type      TEXT NOT NULL,                 -- 'Member' / 'Guest'（分類用）
  name      TEXT NOT NULL,
  email     TEXT NOT NULL,                 -- 小文字化済み。ゲスト再利用・照会の照合に用いる
  phone     TEXT NOT NULL,
  login_id  TEXT                           -- 非PIIの識別子（検索用, 任意）。secret は保持しない
);

-- ゲスト再利用・メール照合（CustomerDirectory.byEmail / emailMatches）。
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
-- ログインID検索（byLoginId）。
CREATE INDEX IF NOT EXISTS idx_customers_login_id ON customers (login_id);
