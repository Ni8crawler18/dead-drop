/**
 * Browser-side AES-256-GCM encryption for Dead Drop intel.
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

export async function generateKey(): Promise<Uint8Array> {
  const key = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

export async function encryptIntel(
  plaintext: string,
  keyBytes?: Uint8Array,
): Promise<{ ciphertext: Uint8Array; key: Uint8Array }> {
  const key = keyBytes ?? (await generateKey());
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: ALGORITHM },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    encoded as ArrayBuffer,
  );
  const ciphertext = new Uint8Array(IV_LENGTH + encrypted.byteLength);
  ciphertext.set(iv, 0);
  ciphertext.set(new Uint8Array(encrypted), IV_LENGTH);
  return { ciphertext, key };
}

export async function decryptIntel(
  ciphertext: Uint8Array,
  keyBytes: Uint8Array,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: ALGORITHM },
    false,
    ["decrypt"],
  );
  const iv = ciphertext.slice(0, IV_LENGTH);
  const data = ciphertext.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    data as ArrayBuffer,
  );
  return new TextDecoder().decode(decrypted);
}

export function toHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function fromHex(hex: string): Uint8Array {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < stripped.length; i += 2) {
    bytes[i / 2] = parseInt(stripped.substring(i, i + 2), 16);
  }
  return bytes;
}
