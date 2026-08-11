// ─────────────────────────────────────────────────────────────
// Encryption abstraction (frontend).
//
// In "mock" mode the frontend performs its own AES-256-GCM
// encryption with the Web Crypto API so the whole UX is
// exercisable without Rust. In "tauri" mode the native layer owns
// encryption (AES-GCM, key in the OS store) and these helpers are
// only used for the in-app screenshot preview rendering.
//
// Interface stays identical so tests can target it directly.
// ─────────────────────────────────────────────────────────────

const ENCRYPTION_KEY_NAME = "time-tracker-encryption-key";

let cachedKey: CryptoKey | null = null;

async function getOrCreateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const existing = localStorage.getItem(ENCRYPTION_KEY_NAME);
  if (existing) {
    const raw = Uint8Array.from(atob(existing), (c) => c.charCodeAt(0));
    cachedKey = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
    return cachedKey;
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  localStorage.setItem(ENCRYPTION_KEY_NAME, b64);
  cachedKey = key;
  return key;
}

export async function encryptBytes(data: Uint8Array): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data),
  );
  return { iv, ciphertext };
}

export async function decryptBytes(
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const key = await getOrCreateKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new Uint8Array(plain);
}

export async function encryptString(plain: string): Promise<string> {
  const { iv, ciphertext } = await encryptBytes(new TextEncoder().encode(plain));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptString(payload: string): Promise<string> {
  const combined = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plain = await decryptBytes(iv, ciphertext);
  return new TextDecoder().decode(plain);
}

export async function isEncryptionAvailable(): Promise<boolean> {
  try {
    await getOrCreateKey();
    return true;
  } catch {
    return false;
  }
}
