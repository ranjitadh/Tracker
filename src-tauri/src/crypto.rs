// ─────────────────────────────────────────────────────────────
// Encryption layer. AES-256-GCM, key generated once per install
// and stored in the app data directory with 0600 permissions.
//
// Used for:
//   • sensitive SQLite columns (session notes, auth metadata)
//   • screenshot files (full-file encryption before any upload)
//
// The key never leaves the device. The frontend previews are the
// only plaintext representation and they exist in memory only.
// ─────────────────────────────────────────────────────────────

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::rngs::OsRng;
use rand::RngCore;
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{AppError, Result};

const KEY_FILE_NAME: &str = "tt-master.key";
const NONCE_LEN: usize = 12;

pub struct Crypto {
    cipher: Aes256Gcm,
}

impl Crypto {
    pub fn load_or_create(data_dir: &Path) -> Result<Self> {
        let key_path = data_dir.join(KEY_FILE_NAME);
        let key = if key_path.exists() {
            read_key(&key_path)?
        } else {
            let key = generate_key();
            write_key(&key_path, &key)?;
            key
        };
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| AppError::Crypto(format!("invalid key: {e}")))?;
        Ok(Self { cipher })
    }

    pub fn encrypt_str(&self, plain: &str) -> Result<String> {
        let mut nonce_bytes = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = self
            .cipher
            .encrypt(nonce, plain.as_bytes())
            .map_err(|e| AppError::Crypto(format!("encrypt failed: {e}")))?;
        let mut combined = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);
        Ok(BASE64.encode(combined))
    }

    pub fn decrypt_str(&self, payload: &str) -> Result<String> {
        let combined = BASE64
            .decode(payload)
            .map_err(|e| AppError::Crypto(format!("invalid base64: {e}")))?;
        if combined.len() < NONCE_LEN {
            return Err(AppError::Crypto("payload too short".into()));
        }
        let (nonce_bytes, ciphertext) = combined.split_at(NONCE_LEN);
        let nonce = Nonce::from_slice(nonce_bytes);
        let plain = self
            .cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| AppError::Crypto(format!("decrypt failed: {e}")))?;
        String::from_utf8(plain).map_err(|e| AppError::Crypto(format!("invalid utf8: {e}")))
    }

    pub fn encrypt_bytes(&self, plain: &[u8]) -> Result<Vec<u8>> {
        let mut nonce_bytes = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = self
            .cipher
            .encrypt(nonce, plain)
            .map_err(|e| AppError::Crypto(format!("encrypt failed: {e}")))?;
        let mut combined = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);
        Ok(combined)
    }

    pub fn decrypt_bytes(&self, combined: &[u8]) -> Result<Vec<u8>> {
        if combined.len() < NONCE_LEN {
            return Err(AppError::Crypto("payload too short".into()));
        }
        let (nonce_bytes, ciphertext) = combined.split_at(NONCE_LEN);
        let nonce = Nonce::from_slice(nonce_bytes);
        self.cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| AppError::Crypto(format!("decrypt failed: {e}")))
    }
}

fn generate_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    key
}

fn read_key(path: &Path) -> Result<[u8; 32]> {
    let raw = fs::read(path)?;
    let decoded = BASE64
        .decode(&raw)
        .map_err(|e| AppError::Crypto(format!("invalid key file: {e}")))?;
    if decoded.len() != 32 {
        return Err(AppError::Crypto("key file has wrong length".into()));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&decoded);
    Ok(key)
}

#[cfg(unix)]
fn write_key(path: &Path, key: &[u8; 32]) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, BASE64.encode(key))?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn write_key(path: &Path, key: &[u8; 32]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, BASE64.encode(key))?;
    Ok(())
}

pub fn data_dir() -> Result<PathBuf> {
    let dir = dirs::data_dir()
        .ok_or_else(|| AppError::Other("cannot resolve app data directory".into()))?
        .join("time-tracker");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn screenshots_dir() -> Result<PathBuf> {
    let dir = data_dir()?.join("screenshots");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

// ── tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_string() {
        let dir = tempfile::tempdir().unwrap();
        let crypto = Crypto::load_or_create(dir.path()).unwrap();
        let payload = "secret note — never stored in plaintext";
        let enc = crypto.encrypt_str(payload).unwrap();
        assert_ne!(enc, payload);
        assert_eq!(crypto.decrypt_str(&enc).unwrap(), payload);
    }

    #[test]
    fn roundtrip_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let crypto = Crypto::load_or_create(dir.path()).unwrap();
        let payload = vec![0u8, 1, 2, 3, 250, 251, 252, 253];
        let enc = crypto.encrypt_bytes(&payload).unwrap();
        assert_eq!(crypto.decrypt_bytes(&enc).unwrap(), payload);
    }

    #[test]
    fn tamper_detected() {
        let dir = tempfile::tempdir().unwrap();
        let crypto = Crypto::load_or_create(dir.path()).unwrap();
        let enc = crypto.encrypt_str("hello").unwrap();
        let mut bytes = BASE64.decode(enc).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 0x01;
        let tampered = BASE64.encode(bytes);
        assert!(crypto.decrypt_str(&tampered).is_err());
    }

    #[test]
    fn key_is_stable_and_private() {
        let dir = tempfile::tempdir().unwrap();
        let a = Crypto::load_or_create(dir.path()).unwrap();
        let b = Crypto::load_or_create(dir.path()).unwrap();
        let enc = a.encrypt_str("stable").unwrap();
        assert_eq!(b.decrypt_str(&enc).unwrap(), "stable");
    }

    #[test]
    fn key_is_rotated_on_new_dir() {
        let dir = tempfile::tempdir().unwrap();
        let a = Crypto::load_or_create(dir.path()).unwrap();
        let other = tempfile::tempdir().unwrap();
        let b = Crypto::load_or_create(other.path()).unwrap();
        let enc_a = a.encrypt_str("x").unwrap();
        assert!(b.decrypt_str(&enc_a).is_err());
    }
}
