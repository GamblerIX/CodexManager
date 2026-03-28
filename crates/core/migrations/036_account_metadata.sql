CREATE TABLE IF NOT EXISTS account_metadata (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  note TEXT,
  tags TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_metadata_updated_at
  ON account_metadata(updated_at DESC, account_id ASC);
