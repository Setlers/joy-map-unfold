import { isIP } from "node:net";

// Only use a forwarded address when the deployment explicitly guarantees that
// Cloudflare overwrites CF-Connecting-IP and the origin cannot be reached directly.
export async function emotionRateLimitSubject(
  remoteAddress: string | undefined,
  cloudflareAddress: string | undefined,
  trustCloudflare: boolean,
): Promise<string> {
  const candidate = trustCloudflare ? cloudflareAddress : remoteAddress;
  const address = candidate?.trim();
  const family = address ? isIP(address) : 0;
  // A shared fallback is deliberately restrictive, rather than accepting a
  // caller-provided identity or silently disabling the limit.
  const identity =
    family === 6
      ? new URL(`http://[${address}]/`).hostname
      : family === 4
        ? address
        : "unknown-client";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`emotion-submission:${identity}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
