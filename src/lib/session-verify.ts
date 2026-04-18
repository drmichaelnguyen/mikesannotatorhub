export const SESSION_COOKIE = "am_session";

export type SessionPayload = {
  userId: string;
  exp: number;
};

export function getSessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-secret-change-me!!";
  }
  throw new Error("Set SESSION_SECRET (16+ chars) in .env");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlDecodeToString(b64url: string): string {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Verifies the signed session cookie (Edge-compatible). */
export async function verifySessionToken(raw: string): Promise<SessionPayload | null> {
  const [b64, sig] = raw.split(".");
  if (!b64 || !sig) return null;
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }
  const expected = await hmacSha256Hex(secret, b64);
  if (!timingSafeEqualHex(expected, sig)) return null;
  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(base64UrlDecodeToString(b64)) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
  if (typeof parsed.userId !== "string") return null;
  return parsed;
}
