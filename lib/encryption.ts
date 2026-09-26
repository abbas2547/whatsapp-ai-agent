import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { env } from "./env";

function key(): Buffer {
  const secret = env().ENCRYPTION_KEY || env().NEXTAUTH_SECRET;
  return scryptSync(secret, "wa-ai-employee", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function maskSecret(value?: string | null) {
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/**
 * Sign an OAuth `state` value so the callback can prove it was issued by us
 * for this deployment (prevents attackers from linking their own Google
 * account to someone else's workspace by forging `state=<victimOrgId>`).
 */
export function signState(value: string) {
  const secret = env().ENCRYPTION_KEY || env().NEXTAUTH_SECRET;
  const sig = createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${sig}`;
}

export function verifyState(state: string): string | null {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const secret = env().ENCRYPTION_KEY || env().NEXTAUTH_SECRET;
  const expected = createHmac("sha256", secret).update(value).digest();
  const actual = Buffer.from(sig, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return value;
}

/** Constant-time string comparison for webhook tokens / secrets. */
export function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Verify a Meta (WhatsApp) webhook signature.
 * signature header: "sha256=<hex HMAC-SHA256(APP_SECRET, rawBody)>"
 */
export function verifyMetaSignature(appSecret: string, rawBody: string, signatureHeader: string | null): boolean {
  if (!appSecret || !signatureHeader) return false;
  const prefix = "sha256=";
  const hex = signatureHeader.startsWith(prefix) ? signatureHeader.slice(prefix.length) : signatureHeader;
  let actual: Buffer;
  try {
    actual = Buffer.from(hex, "hex");
  } catch {
    return false;
  }
  if (!actual.length) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
