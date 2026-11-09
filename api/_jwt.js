// api/_jwt.js
// Sign & verify HS256 JWTs using Web Crypto (Node 20+/26 global).
// Vercel skips files starting with "_" when routing, so this is a pure helper.

function strToBytes(s) { return new TextEncoder().encode(s); }

function b64urlFromBytes(bytes) {
  const arr = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret, usage) {
  return crypto.subtle.importKey(
    'raw',
    strToBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

export async function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64urlFromBytes(strToBytes(JSON.stringify(header)));
  const p = b64urlFromBytes(strToBytes(JSON.stringify(payload)));
  const data = h + '.' + p;

  const key = await importHmacKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, strToBytes(data));

  return data + '.' + b64urlFromBytes(sig);
}

// Returns the payload if the token is well-formed, correctly signed, and not expired.
// Returns null otherwise (never throws).
export async function verifyJwt(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  let valid;
  try {
    const key = await importHmacKey(secret, 'verify');
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sig),
      strToBytes(h + '.' + p)
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number') return null;
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;

  return payload;
}
