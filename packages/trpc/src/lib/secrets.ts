// Symmetric encryption for stored connection secrets (AES-256-GCM). Secrets are encrypted at
// rest in `connections.secret_enc` and only ever decrypted server-side by the runtime — they
// are never returned to the client.
//
// The key derives from WORKFLOW_SECRETS_KEY in prod; in dev it falls back to the Supabase
// service-role key (already a server-only secret) so local dev works without extra config.
// A hardcoded last-resort default keeps dev-from-zero alive but is clearly insecure.
import crypto from "node:crypto";

function key(): Buffer {
  const src =
    process.env.WORKFLOW_SECRETS_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "beamy-dev-insecure-secrets-key";
  return crypto.createHash("sha256").update(src).digest(); // 32 bytes
}

/** Encrypt a secret object → base64(iv | authTag | ciphertext). */
export function encryptSecret(value: Record<string, unknown>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** Decrypt what `encryptSecret` produced. Throws if the key is wrong or the blob is tampered. */
export function decryptSecret(enc: string): Record<string, unknown> {
  const buf = Buffer.from(enc, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  return JSON.parse(pt) as Record<string, unknown>;
}
