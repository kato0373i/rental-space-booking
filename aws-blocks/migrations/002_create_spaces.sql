-- スペースコンテキストの永続化スキーマ（設計 docs/design/aws-blocks-async-ports.md §4, #9）。
-- スペースは「設定」集約であり占有制約を持たない。VO群はアプリ層の SpaceInput 形に
-- 写像して JSON 文字列で保持し、読み出し時に buildSpaceAttributes で再構築する。
CREATE TABLE IF NOT EXISTS spaces (
  id            TEXT PRIMARY KEY,
  input_json    TEXT NOT NULL,           -- JSON: SpaceInput（名称/定員/営業時間/料金表/キャンセル段階 等）
  publish_state TEXT NOT NULL            -- 'Published' / 'Suspended'
);
