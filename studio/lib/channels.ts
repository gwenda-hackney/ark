const TOKEN_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const TOKEN_LENGTH = 10;

/** Short, URL-friendly channel access code (10 lowercase alphanumeric chars). */
export function generateChannelToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length],
  ).join("");
}
