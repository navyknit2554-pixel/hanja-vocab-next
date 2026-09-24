import { createPrivateKey, createSign } from "crypto";

export async function sendWebPushNotification(subscription) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) throw new Error("VAPID 키가 필요합니다.");

  const endpoint = String(subscription?.endpoint || "");
  if (!endpoint) throw new Error("푸시 엔드포인트가 없습니다.");

  const audience = new URL(endpoint).origin;
  const jwt = createVapidJwt({ audience, subject, publicKey, privateKey });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      TTL: "86400",
      Urgency: "normal",
      "Content-Length": "0"
    }
  });

  return {
    ok: response.ok,
    status: response.status,
    expired: response.status === 404 || response.status === 410
  };
}

function createVapidJwt({ audience, subject, publicKey, privateKey }) {
  const header = base64UrlJson({ typ: "JWT", alg: "ES256" });
  const payload = base64UrlJson({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
    sub: subject
  });
  const unsignedToken = `${header}.${payload}`;
  const keyObject = createPrivateKey({
    key: createPrivateJwk({ publicKey, privateKey }),
    format: "jwk"
  });
  const signer = createSign("SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign({ key: keyObject, dsaEncoding: "ieee-p1363" });
  return `${unsignedToken}.${toBase64Url(signature)}`;
}

function createPrivateJwk({ publicKey, privateKey }) {
  const publicBuffer = fromBase64Url(publicKey);
  if (publicBuffer.length !== 65 || publicBuffer[0] !== 4) {
    throw new Error("VAPID 공개키 형식이 올바르지 않습니다.");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: toBase64Url(publicBuffer.subarray(1, 33)),
    y: toBase64Url(publicBuffer.subarray(33, 65)),
    d: toBase64Url(fromBase64Url(privateKey))
  };
}

function base64UrlJson(value) {
  return toBase64Url(Buffer.from(JSON.stringify(value)));
}

function fromBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
