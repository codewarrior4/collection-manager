/**
 * Thin wrapper around the Web Crypto API's randomUUID function.
 * Generates a cryptographically random RFC 4122 version 4 UUID.
 */
export function generateUUID(): string {
  return crypto.randomUUID()
}
