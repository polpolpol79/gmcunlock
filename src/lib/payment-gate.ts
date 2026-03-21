import crypto from "crypto";

type PaidScanTokenPayload = {
  purpose: "paid_scan";
  iat: number;
  exp: number;
};

const TOKEN_TTL_SECONDS = 15 * 60;

function getSecret(): string {
  return process.env.NEXTAUTH_SECRET || "dev-only-secret";
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(payloadJson: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payloadJson).digest("base64url");
}

export function createPaidScanToken(nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const payload: PaidScanTokenPayload = {
    purpose: "paid_scan",
    iat,
    exp: iat + TOKEN_TTL_SECONDS,
  };
  const payloadJson = JSON.stringify(payload);
  const encodedPayload = toBase64Url(payloadJson);
  const signature = signPayload(payloadJson);
  return `${encodedPayload}.${signature}`;
}

export function verifyPaidScanToken(token: unknown, nowMs = Date.now()): boolean {
  if (typeof token !== "string") return false;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  try {
    const payloadJson = fromBase64Url(encodedPayload);
    const expectedSignature = signPayload(payloadJson);
    if (signature !== expectedSignature) return false;

    const payload = JSON.parse(payloadJson) as Partial<PaidScanTokenPayload>;
    if (payload.purpose !== "paid_scan") return false;
    if (typeof payload.exp !== "number" || typeof payload.iat !== "number") return false;
    const nowSec = Math.floor(nowMs / 1000);
    if (payload.exp < nowSec) return false;
    if (payload.iat > nowSec + 60) return false;
    return true;
  } catch {
    return false;
  }
}

