use rusqlite::{Result, Row};

use super::{Storage, Token};

impl Storage {
    pub fn insert_token(&self, token: &Token) -> Result<()> {
        let enc_id_token = self
            .encryption
            .encrypt_field(&token.id_token)
            .map_err(super::crypto_write_error)?;
        let enc_access_token = self
            .encryption
            .encrypt_field(&token.access_token)
            .map_err(super::crypto_write_error)?;
        let enc_refresh_token = self
            .encryption
            .encrypt_field(&token.refresh_token)
            .map_err(super::crypto_write_error)?;
        let enc_api_key_access_token = self
            .encryption
            .encrypt_optional_field(&token.api_key_access_token)
            .map_err(super::crypto_write_error)?;
        self.conn.execute(
            "INSERT INTO tokens (account_id, id_token, access_token, refresh_token, api_key_access_token, last_refresh)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(account_id) DO UPDATE SET
                id_token = excluded.id_token,
                access_token = excluded.access_token,
                refresh_token = excluded.refresh_token,
                api_key_access_token = excluded.api_key_access_token,
                last_refresh = excluded.last_refresh",
            (
                &token.account_id,
                &enc_id_token,
                &enc_access_token,
                &enc_refresh_token,
                &enc_api_key_access_token,
                token.last_refresh,
            ),
        )?;
        Ok(())
    }

    pub fn list_tokens_due_for_refresh(&self, now_ts: i64, limit: usize) -> Result<Vec<Token>> {
        let mut stmt = self.conn.prepare(
            "WITH latest_status AS (
                SELECT
                    account_id,
                    message,
                    ROW_NUMBER() OVER (
                        PARTITION BY account_id
                        ORDER BY created_at DESC, id DESC
                    ) AS rn
                FROM events
                WHERE type = 'account_status_update'
             )
             SELECT tokens.account_id, tokens.id_token, tokens.access_token, tokens.refresh_token, tokens.api_key_access_token, tokens.last_refresh
             FROM tokens
             LEFT JOIN latest_status
               ON latest_status.account_id = tokens.account_id
              AND latest_status.rn = 1
             WHERE TRIM(COALESCE(refresh_token, '')) <> ''
               AND (
                    latest_status.message IS NULL
                    OR (
                        latest_status.message NOT LIKE '% reason=account_deactivated'
                        AND latest_status.message NOT LIKE '% reason=workspace_deactivated'
                        AND latest_status.message NOT LIKE '% reason=deactivated_workspace'
                        AND latest_status.message NOT LIKE '% reason=refresh_token_invalid:%'
                    )
               )
               AND (next_refresh_at IS NULL OR next_refresh_at <= ?1)
             ORDER BY COALESCE(tokens.next_refresh_at, 0) ASC, tokens.account_id ASC
             LIMIT ?2",
        )?;
        let mut rows = stmt.query((now_ts, limit as i64))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(map_token_row(row, self)?);
        }
        Ok(out)
    }

    pub fn update_token_refresh_schedule(
        &self,
        account_id: &str,
        access_token_exp: Option<i64>,
        next_refresh_at: Option<i64>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE tokens
             SET access_token_exp = ?1,
                 next_refresh_at = ?2
             WHERE account_id = ?3",
            (access_token_exp, next_refresh_at, account_id),
        )?;
        Ok(())
    }

    pub fn touch_token_refresh_attempt(&self, account_id: &str, attempt_ts: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE tokens
             SET last_refresh_attempt_at = ?1
             WHERE account_id = ?2",
            (attempt_ts, account_id),
        )?;
        Ok(())
    }

    pub fn token_count(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(1) FROM tokens", [], |row| row.get(0))
    }

    pub fn list_tokens(&self) -> Result<Vec<Token>> {
        let mut stmt = self.conn.prepare(
            "SELECT account_id, id_token, access_token, refresh_token, api_key_access_token, last_refresh FROM tokens",
        )?;
        let mut rows = stmt.query([])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(map_token_row(row, self)?);
        }
        Ok(out)
    }

    pub fn list_tokens_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Token>> {
        if account_ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders = account_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT account_id, id_token, access_token, refresh_token, api_key_access_token, last_refresh \
             FROM tokens WHERE account_id IN ({placeholders})"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let params = rusqlite::params_from_iter(account_ids.iter());
        let mut rows = stmt.query(params)?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(map_token_row(row, self)?);
        }
        Ok(out)
    }

    pub fn find_token_by_account_id(&self, account_id: &str) -> Result<Option<Token>> {
        let mut stmt = self.conn.prepare(
            "SELECT account_id, id_token, access_token, refresh_token, api_key_access_token, last_refresh
             FROM tokens
             WHERE account_id = ?1
             LIMIT 1",
        )?;
        let mut rows = stmt.query([account_id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(map_token_row(row, self)?))
        } else {
            Ok(None)
        }
    }

    pub(super) fn ensure_token_api_key_column(&self) -> Result<()> {
        if self.has_column("tokens", "api_key_access_token")? {
            return Ok(());
        }
        self.conn.execute(
            "ALTER TABLE tokens ADD COLUMN api_key_access_token TEXT",
            [],
        )?;
        Ok(())
    }

    pub(super) fn ensure_token_refresh_schedule_columns(&self) -> Result<()> {
        self.ensure_column("tokens", "access_token_exp", "INTEGER")?;
        self.ensure_column("tokens", "next_refresh_at", "INTEGER")?;
        self.ensure_column("tokens", "last_refresh_attempt_at", "INTEGER")?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tokens_next_refresh_at ON tokens(next_refresh_at)",
            [],
        )?;
        Ok(())
    }
}

/// 从数据库行映射 Token 结构体，并解密敏感字段
fn map_token_row(row: &Row<'_>, storage: &Storage) -> Result<Token> {
    let id_token_raw: String = row.get(1)?;
    let access_token_raw: String = row.get(2)?;
    let refresh_token_raw: String = row.get(3)?;
    let api_key_access_token_raw: Option<String> = row.get(4)?;

    Ok(Token {
        account_id: row.get(0)?,
        id_token: storage
            .encryption
            .decrypt_field(&id_token_raw)
            .map_err(|err| super::crypto_read_error(1, err))?,
        access_token: storage
            .encryption
            .decrypt_field(&access_token_raw)
            .map_err(|err| super::crypto_read_error(2, err))?,
        refresh_token: storage
            .encryption
            .decrypt_field(&refresh_token_raw)
            .map_err(|err| super::crypto_read_error(3, err))?,
        api_key_access_token: storage
            .encryption
            .decrypt_optional_field(api_key_access_token_raw)
            .map_err(|err| super::crypto_read_error(4, err))?,
        last_refresh: row.get(5)?,
    })
}
