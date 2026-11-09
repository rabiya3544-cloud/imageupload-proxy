// api/_crypto.js
// Server-side port of the client-side KeyEncryptor.decrypt().
// Same algorithm: PBKDF2(SHA-256, 600k iterations) → AES-GCM-256.
// Handles `{ iv, salt, ciphertext }` where all three are base64.

const PBKDF2_ITER = 600000;

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt) {
  const km = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

// Throws if the password is wrong (AES-GCM tag mismatch) or the bundle is malformed.
export async function decryptBundle(bundle, password) {
  const iv         = b64ToBytes(bundle.iv);
  const salt       = b64ToBytes(bundle.salt);
  const ciphertext = b64ToBytes(bundle.ciphertext);

  const key = await deriveKey(password, salt);
  const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

  return new TextDecoder().decode(pt);
}
