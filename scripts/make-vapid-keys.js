const { createECDH } = require("crypto");

const keyPair = createECDH("prime256v1");
keyPair.generateKeys();

console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + toBase64Url(keyPair.getPublicKey()));
console.log("VAPID_PRIVATE_KEY=" + toBase64Url(keyPair.getPrivateKey()));
console.log("VAPID_SUBJECT=mailto:your-email@example.com");

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
