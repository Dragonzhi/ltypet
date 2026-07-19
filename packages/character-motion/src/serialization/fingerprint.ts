/**
 * SHA-256 fingerprinting of canonicalized artwork text.
 * Uses Web Crypto API (available in modern JS runtimes, no Node deps).
 */

import { canonicalizeArtworkText } from "./canonicalize.js";

/**
 * Computes the SHA-256 fingerprint of canonicalized text.
 * Returns a string in the format "sha256:<64-hex-chars>".
 *
 * Uses the Web Crypto API's subtle.digest which is available in:
 * - Modern browsers
 * - Node.js 15+ (globalThis.crypto)
 * - Cloudflare Workers
 * - Deno
 */
export async function sha256CanonicalText(text: string): Promise<string> {
  const canonical = canonicalizeArtworkText(text);

  // Encode as UTF-8
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);

  // Compute SHA-256
  const crypto = globalThis.crypto;
  if (!crypto || !crypto.subtle) {
    throw new Error(
      "Web Crypto API not available. Requires Node.js 15+, modern browser, or similar runtime.",
    );
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexString = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hexString}`;
}
