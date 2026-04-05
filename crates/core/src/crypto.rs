/// 字段级加密模块。
///
/// 使用 AES-256-GCM 对敏感字段（令牌、密钥等）进行加密/解密。
/// 每个 Storage 实例持有自己的加密上下文，避免多数据库/测试场景串用全局密钥。
/// 加密后的数据格式: "enc:v1:<base64(nonce + ciphertext)>"。
/// 未加密的数据（旧格式）保持兼容读取，但损坏的密文会显式报错。

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    AeadCore, Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use std::fmt;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

/// 加密数据前缀标识。
pub(crate) const ENCRYPTED_PREFIX: &str = "enc:v1:";

/// AES-256-GCM 密钥长度（字节）。
const KEY_LEN: usize = 32;

/// Nonce 长度（字节）。
const NONCE_LEN: usize = 12;

#[derive(Debug, Clone)]
pub struct EncryptionContext {
    key_bytes: [u8; KEY_LEN],
}

#[derive(Debug)]
pub enum CryptoError {
    KeyFileRead { path: PathBuf, message: String },
    KeyFileWrite { path: PathBuf, message: String },
    KeyFileInvalidLength { path: PathBuf, actual: usize },
    MissingKeyFileForExistingDatabase { path: PathBuf },
    PermissionUpdate { path: PathBuf, message: String },
    UnexpectedPlaintextField,
    InvalidEncryptedField(String),
    EncryptFailed,
    DecryptFailed,
    Utf8(String),
}

impl fmt::Display for CryptoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::KeyFileRead { path, message } => {
                write!(f, "读取加密 keyfile 失败 ({}): {message}", path.display())
            }
            Self::KeyFileWrite { path, message } => {
                write!(f, "写入加密 keyfile 失败 ({}): {message}", path.display())
            }
            Self::KeyFileInvalidLength { path, actual } => write!(
                f,
                "加密 keyfile 长度无效 ({}): 期望 {KEY_LEN} 字节，实际 {actual} 字节",
                path.display()
            ),
            Self::MissingKeyFileForExistingDatabase { path } => write!(
                f,
                "已有数据库缺少加密 keyfile，拒绝自动重建 ({})",
                path.display()
            ),
            Self::PermissionUpdate { path, message } => {
                write!(f, "更新文件权限失败 ({}): {message}", path.display())
            }
            Self::UnexpectedPlaintextField => write!(f, "敏感字段缺少加密前缀"),
            Self::InvalidEncryptedField(message) => write!(f, "损坏的加密字段: {message}"),
            Self::EncryptFailed => write!(f, "AES-256-GCM 加密失败"),
            Self::DecryptFailed => write!(f, "AES-256-GCM 解密失败"),
            Self::Utf8(message) => write!(f, "解密后的 UTF-8 数据无效: {message}"),
        }
    }
}

impl std::error::Error for CryptoError {}

impl EncryptionContext {
    pub fn for_db_path(db_path: &Path, allow_create_if_missing: bool) -> Result<Self, CryptoError> {
        let key_path = resolve_key_path(db_path);
        let key_bytes = load_or_create_key(&key_path, allow_create_if_missing)?;
        Ok(Self { key_bytes })
    }

    pub fn for_in_memory() -> Self {
        Self {
            key_bytes: rand::random(),
        }
    }

    pub fn encrypt_field(&self, plaintext: &str) -> Result<String, CryptoError> {
        if plaintext.is_empty() {
            return Ok(String::new());
        }

        let key = Key::<Aes256Gcm>::from_slice(&self.key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = cipher
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|_| CryptoError::EncryptFailed)?;

        let mut combined = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        combined.extend_from_slice(nonce.as_slice());
        combined.extend_from_slice(&ciphertext);
        Ok(format!("{}{}", ENCRYPTED_PREFIX, BASE64.encode(&combined)))
    }

    pub fn decrypt_field(&self, stored: &str) -> Result<String, CryptoError> {
        let Some(encoded) = stored.strip_prefix(ENCRYPTED_PREFIX) else {
            return Err(CryptoError::UnexpectedPlaintextField);
        };

        let combined = BASE64
            .decode(encoded)
            .map_err(|err| CryptoError::InvalidEncryptedField(format!("Base64 解码失败: {err}")))?;
        if combined.len() <= NONCE_LEN {
            return Err(CryptoError::InvalidEncryptedField(
                "密文字节数不足".to_string(),
            ));
        }

        let (nonce_bytes, ciphertext) = combined.split_at(NONCE_LEN);
        let nonce = Nonce::from_slice(nonce_bytes);
        let key = Key::<Aes256Gcm>::from_slice(&self.key_bytes);
        let cipher = Aes256Gcm::new(key);
        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| CryptoError::DecryptFailed)?;

        String::from_utf8(plaintext).map_err(|err| CryptoError::Utf8(err.to_string()))
    }

    pub fn encrypt_optional_field(
        &self,
        value: &Option<String>,
    ) -> Result<Option<String>, CryptoError> {
        match value {
            Some(value) => self.encrypt_field(value).map(Some),
            None => Ok(None),
        }
    }

    pub fn decrypt_optional_field(
        &self,
        value: Option<String>,
    ) -> Result<Option<String>, CryptoError> {
        match value {
            Some(value) => self.decrypt_field(&value).map(Some),
            None => Ok(None),
        }
    }
}

/// 判断字段是否已加密。
pub fn is_encrypted(value: &str) -> bool {
    value.starts_with(ENCRYPTED_PREFIX)
}

fn resolve_key_path(db_path: &Path) -> PathBuf {
    db_path
        .parent()
        .unwrap_or(Path::new("."))
        .join(".codexmanager.keyfile")
}

fn load_or_create_key(
    key_path: &Path,
    allow_create_if_missing: bool,
) -> Result<[u8; KEY_LEN], CryptoError> {
    match std::fs::read(key_path) {
        Ok(data) => {
            let key_bytes = parse_key_bytes(key_path, &data)?;
            restrict_file_permissions(key_path)?;
            Ok(key_bytes)
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound && allow_create_if_missing => {
            create_new_key_file(key_path)
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            Err(CryptoError::MissingKeyFileForExistingDatabase {
                path: key_path.to_path_buf(),
            })
        }
        Err(err) => Err(CryptoError::KeyFileRead {
            path: key_path.to_path_buf(),
            message: err.to_string(),
        }),
    }
}

fn parse_key_bytes(key_path: &Path, data: &[u8]) -> Result<[u8; KEY_LEN], CryptoError> {
    if data.len() != KEY_LEN {
        return Err(CryptoError::KeyFileInvalidLength {
            path: key_path.to_path_buf(),
            actual: data.len(),
        });
    }

    let mut key_bytes = [0u8; KEY_LEN];
    key_bytes.copy_from_slice(data);
    Ok(key_bytes)
}

fn create_new_key_file(key_path: &Path) -> Result<[u8; KEY_LEN], CryptoError> {
    if let Some(parent) = key_path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| CryptoError::KeyFileWrite {
            path: parent.to_path_buf(),
            message: err.to_string(),
        })?;
    }

    let key_bytes: [u8; KEY_LEN] = rand::random();
    match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(key_path)
    {
        Ok(mut file) => {
            file.write_all(&key_bytes)
                .and_then(|_| file.sync_all())
                .map_err(|err| CryptoError::KeyFileWrite {
                    path: key_path.to_path_buf(),
                    message: err.to_string(),
                })?;
            restrict_file_permissions(key_path)?;
            Ok(key_bytes)
        }
        Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
            let data = std::fs::read(key_path).map_err(|read_err| CryptoError::KeyFileRead {
                path: key_path.to_path_buf(),
                message: read_err.to_string(),
            })?;
            let key_bytes = parse_key_bytes(key_path, &data)?;
            restrict_file_permissions(key_path)?;
            Ok(key_bytes)
        }
        Err(err) => Err(CryptoError::KeyFileWrite {
            path: key_path.to_path_buf(),
            message: err.to_string(),
        }),
    }
}

/// 限制文件权限，仅允许当前用户读写。
pub fn restrict_file_permissions(path: &Path) -> Result<(), CryptoError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).map_err(|err| {
            CryptoError::PermissionUpdate {
                path: path.to_path_buf(),
                message: err.to_string(),
            }
        })?;
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let path_str = path.to_str().ok_or_else(|| CryptoError::PermissionUpdate {
            path: path.to_path_buf(),
            message: "路径包含无效 UTF-8，无法调用 icacls".to_string(),
        })?;

        let disable_inheritance = std::process::Command::new("icacls")
            .args([path_str, "/inheritance:r"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|err| CryptoError::PermissionUpdate {
                path: path.to_path_buf(),
                message: format!("调用 icacls 禁用继承失败: {err}"),
            })?;
        if !disable_inheritance.status.success() {
            return Err(CryptoError::PermissionUpdate {
                path: path.to_path_buf(),
                message: format!(
                    "icacls 禁用继承失败: {}",
                    windows_command_error(&disable_inheritance.stderr, disable_inheritance.status.code())
                ),
            });
        }

        let user = std::env::var("USERNAME").map_err(|err| CryptoError::PermissionUpdate {
            path: path.to_path_buf(),
            message: format!("读取当前用户名失败: {err}"),
        })?;
        let grant = format!("{user}:(F)");
        let grant_output = std::process::Command::new("icacls")
            .args([path_str, "/grant:r", &grant])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|err| CryptoError::PermissionUpdate {
                path: path.to_path_buf(),
                message: format!("调用 icacls 授权失败: {err}"),
            })?;
        if !grant_output.status.success() {
            return Err(CryptoError::PermissionUpdate {
                path: path.to_path_buf(),
                message: format!(
                    "icacls 授权失败: {}",
                    windows_command_error(&grant_output.stderr, grant_output.status.code())
                ),
            });
        }
    }

    Ok(())
}

#[cfg(windows)]
fn windows_command_error(stderr: &[u8], code: Option<i32>) -> String {
    let detail = String::from_utf8_lossy(stderr).trim().to_string();
    if detail.is_empty() {
        format!("exit_code={}", code.map_or_else(|| "unknown".to_string(), |value| value.to_string()))
    } else {
        detail
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "codexmanager_crypto_{prefix}_{}_{}",
            std::process::id(),
            unique
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn encryption_context_roundtrip_succeeds() {
        let context = EncryptionContext::for_in_memory();
        let original = "my-secret-token-value";
        let encrypted = context.encrypt_field(original).expect("encrypt value");

        assert!(encrypted.starts_with(ENCRYPTED_PREFIX));
        assert_ne!(encrypted, original);
        assert_eq!(
            context.decrypt_field(&encrypted).expect("decrypt value"),
            original
        );
    }

    #[test]
    fn decrypt_field_rejects_damaged_ciphertext() {
        let context = EncryptionContext::for_in_memory();
        let err = context
            .decrypt_field("enc:v1:not-valid-base64")
            .expect_err("expected damaged ciphertext error");
        assert!(err.to_string().contains("Base64"));
    }

    #[test]
    fn file_context_rejects_invalid_keyfile_length() {
        let dir = create_temp_dir("invalid_keyfile");
        let db_path = dir.join("codexmanager.db");
        let key_path = dir.join(".codexmanager.keyfile");
        fs::write(&key_path, [1u8, 2u8, 3u8]).expect("write invalid keyfile");

        let err = EncryptionContext::for_db_path(&db_path).expect_err("expected invalid keyfile");
        assert!(err.to_string().contains("长度无效"));

        fs::remove_dir_all(&dir).expect("cleanup temp dir");
    }
}
