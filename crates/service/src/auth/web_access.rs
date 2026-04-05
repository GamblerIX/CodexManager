use crate::app_settings::{
    get_persisted_app_setting, normalize_optional_text, save_persisted_app_setting,
    APP_SETTING_WEB_ACCESS_PASSWORD_HASH_KEY,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

pub fn current_web_access_password_hash() -> Option<String> {
    get_persisted_app_setting(APP_SETTING_WEB_ACCESS_PASSWORD_HASH_KEY)
}

pub fn web_access_password_configured() -> bool {
    current_web_access_password_hash().is_some()
}

pub fn set_web_access_password(password: Option<&str>) -> Result<bool, String> {
    match normalize_optional_text(password) {
        Some(value) => {
            let hashed = hash_web_access_password(&value);
            save_persisted_app_setting(APP_SETTING_WEB_ACCESS_PASSWORD_HASH_KEY, Some(&hashed))?;
            Ok(true)
        }
        None => {
            save_persisted_app_setting(APP_SETTING_WEB_ACCESS_PASSWORD_HASH_KEY, Some(""))?;
            Ok(false)
        }
    }
}

pub fn web_auth_status_value() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "passwordConfigured": web_access_password_configured(),
    }))
}

pub fn verify_web_access_password(password: &str) -> bool {
    let Some(stored_hash) = current_web_access_password_hash() else {
        return true;
    };
    verify_password_hash(password, &stored_hash)
}

pub fn build_web_access_session_token(password_hash: &str, rpc_token: &str) -> String {
    type HmacSha256 = Hmac<Sha256>;
    let mut mac =
        HmacSha256::new_from_slice(rpc_token.as_bytes()).expect("HMAC 接受任意长度密钥");
    mac.update(b"codexmanager-web-auth-session:");
    mac.update(password_hash.as_bytes());
    hex_encode(mac.finalize().into_bytes().as_slice())
}

/// 使用 Argon2id 对密码进行哈希
fn hash_web_access_password(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .expect("Argon2 hash failed")
        .to_string()
}

/// 验证密码哈希，同时兼容旧版 sha256 格式和新版 argon2id 格式
fn verify_password_hash(password: &str, stored_hash: &str) -> bool {
    if stored_hash.starts_with("sha256$") {
        verify_legacy_sha256(password, stored_hash)
    } else {
        verify_argon2(password, stored_hash)
    }
}

/// 验证 Argon2id 密码哈希
fn verify_argon2(password: &str, stored_hash: &str) -> bool {
    let Ok(parsed_hash) = PasswordHash::new(stored_hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
}

/// 兼容旧版 sha256$salt$hash 格式的验证
fn verify_legacy_sha256(password: &str, stored_hash: &str) -> bool {
    let mut parts = stored_hash.split('$');
    let Some(kind) = parts.next() else {
        return false;
    };
    let Some(salt_hex) = parts.next() else {
        return false;
    };
    let Some(expected_hash) = parts.next() else {
        return false;
    };
    if kind != "sha256" || parts.next().is_some() {
        return false;
    }
    super::rpc::constant_time_eq(
        hex_sha256(format!("{salt_hex}:{password}").as_bytes()).as_bytes(),
        expected_hash.as_bytes(),
    )
}

fn hex_sha256(bytes: impl AsRef<[u8]>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes.as_ref());
    let digest = hasher.finalize();
    hex_encode(digest.as_slice())
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}
