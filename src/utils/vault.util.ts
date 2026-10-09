import SecureLS from 'secure-ls';
import type { ICredential, IVaultRecord } from '../types';

export interface EncryptedVaultData {
  salt: string;
  iv: string;
  ciphertext: string;
  version: number;
}

/**
 * Converts a Uint8Array to a Base64 string safely across environments.
 */
export function bufferToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return window.btoa(binary);
}

/**
 * Converts a Base64 string to a Uint8Array.
 */
export function base64ToBuffer(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives an AES-GCM (256-bit) encryption key from a user PIN/passphrase using PBKDF2 (100,000 iterations, SHA-256).
 */
export async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts a list of ICredential objects into an AES-GCM ciphertext payload with a random salt and IV.
 */
export async function encryptCredentials(
  credentials: ICredential[],
  pin: string,
  existingSalt?: Uint8Array,
): Promise<EncryptedVaultData> {
  const salt = existingSalt || window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);

  const data = new TextEncoder().encode(JSON.stringify(credentials));
  const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  return {
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(new Uint8Array(encrypted)),
    version: 1,
  };
}

/**
 * Decrypts an AES-GCM ciphertext payload using the user PIN.
 * Throws an Error if the PIN is incorrect or decryption fails.
 */
export async function decryptCredentials(
  vault: Pick<IVaultRecord, 'salt' | 'iv' | 'ciphertext'>,
  pin: string,
): Promise<ICredential[]> {
  const salt = base64ToBuffer(vault.salt);
  const iv = base64ToBuffer(vault.iv);
  const ciphertext = base64ToBuffer(vault.ciphertext);

  const key = await deriveKey(pin, salt);
  const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

  const json = new TextDecoder().decode(decrypted);
  return JSON.parse(json) as ICredential[];
}

/**
 * Safely inspects the browser for legacy secure-ls credentials without throwing.
 */
export function readLegacySecureLSCredentials(): ICredential[] | null {
  try {
    const ls = new SecureLS({ encodingType: 'aes' });
    const legacy = ls.get('flow_manager_credentials');
    if (Array.isArray(legacy) && legacy.length > 0) {
      return legacy as ICredential[];
    }
  } catch {
    // ignore
  }

  // Also fallback check direct raw localStorage in case stored unencoded
  try {
    const raw = localStorage.getItem('flow_manager_credentials');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as ICredential[];
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Purges legacy secure-ls data from browser localStorage.
 */
export function purgeLegacySecureLS(): void {
  try {
    const ls = new SecureLS({ encodingType: 'aes' });
    ls.remove('flow_manager_credentials');
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem('flow_manager_credentials');
    localStorage.removeItem('_secure__ls__metadata');
  } catch {
    // ignore
  }
}
