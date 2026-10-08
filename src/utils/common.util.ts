export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates a standard Version 4 UUID securely.
 *
 * @returns {string} A valid UUIDv4 string.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      // Fetch a single secure random byte (0-255)
      const randomByte = crypto.getRandomValues(new Uint8Array(1))[0];

      // Modulo 16 restricts it to 0-15
      const r = (randomByte as number) % 16;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;

      return v.toString(16);
    });
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;

    return v.toString(16);
  });
}
