/**
 * Dead Drop Encryption Utilities
 *
 * Client-side AES-256-GCM encryption for intel content.
 * The encrypted payload is stored on-chain; the key is revealed via event on purchase.
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for GCM

/**
 * Generate a random AES-256 key and export it as raw bytes.
 */
export async function generateKey(): Promise<Uint8Array> {
    const key = await crypto.subtle.generateKey(
        { name: ALGORITHM, length: KEY_LENGTH },
        true,
        ["encrypt", "decrypt"]
    );
    const raw = await crypto.subtle.exportKey("raw", key);
    return new Uint8Array(raw);
}

/**
 * Encrypt plaintext intel using AES-256-GCM.
 *
 * @returns Object with `ciphertext` (iv prepended) and `key` as Uint8Arrays.
 *          The ciphertext format is: [12-byte IV] [encrypted data + GCM tag]
 */
export async function encryptIntel(
    plaintext: string,
    keyBytes?: Uint8Array
): Promise<{ ciphertext: Uint8Array; key: Uint8Array }> {
    const key = keyBytes ?? (await generateKey());

    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        key,
        { name: ALGORITHM },
        false,
        ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(plaintext);

    const encrypted = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        cryptoKey,
        encoded
    );

    // Prepend IV to ciphertext for self-contained decryption
    const ciphertext = new Uint8Array(IV_LENGTH + encrypted.byteLength);
    ciphertext.set(iv, 0);
    ciphertext.set(new Uint8Array(encrypted), IV_LENGTH);

    return { ciphertext, key };
}

/**
 * Decrypt intel ciphertext using AES-256-GCM.
 *
 * @param ciphertext - The encrypted payload (IV prepended)
 * @param keyBytes - The 32-byte AES key
 * @returns Decrypted plaintext string
 */
export async function decryptIntel(
    ciphertext: Uint8Array,
    keyBytes: Uint8Array
): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: ALGORITHM },
        false,
        ["decrypt"]
    );

    const iv = ciphertext.slice(0, IV_LENGTH);
    const data = ciphertext.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        cryptoKey,
        data
    );

    return new TextDecoder().decode(decrypted);
}

/**
 * Convert Uint8Array to hex string (for on-chain storage).
 */
export function toHex(bytes: Uint8Array): string {
    return (
        "0x" +
        Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
    );
}

/**
 * Convert hex string back to Uint8Array.
 */
export function fromHex(hex: string): Uint8Array {
    const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(stripped.length / 2);
    for (let i = 0; i < stripped.length; i += 2) {
        bytes[i / 2] = parseInt(stripped.substring(i, i + 2), 16);
    }
    return bytes;
}
