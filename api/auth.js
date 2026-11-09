// api/auth.js
import { applyCors }        from './_cors.js';
import { decryptBundle }    from './_crypto.js';
import { signJwt }          from './_jwt.js';

const JWT_TTL_SECONDS = 24 * 60 * 60; // 24h

// XOR-accumulate compare — cheap constant-time protection on the equality check.
function timingSafeEqual(a, b) {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const password = (req.body && req.body.password) || '';
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ ok: false, error: 'password required' });
  }

  const iv         = process.env.iv;
  const salt       = process.env.salt;
  const ciphertext = process.env.ciphertext;
  const proxyKey   = process.env.PROXY_ACCESS_KEY;

  if (!iv || !salt || !ciphertext) {
    return res.status(500).json({ ok: false, error: 'Auth bundle not configured' });
  }
  if (!proxyKey) {
    return res.status(500).json({ ok: false, error: 'PROXY_ACCESS_KEY not configured' });
  }

  // 1) Decrypt — wrong password throws on AES-GCM tag check.
  let plaintext;
  try {
    plaintext = await decryptBundle({ iv, salt, ciphertext }, password);
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid password' });
  }

  // 2) Confirm the decrypted plaintext matches the expected value.
  if (!timingSafeEqual(plaintext, proxyKey)) {
    return res.status(401).json({ ok: false, error: 'Invalid password' });
  }

  // 3) Issue JWT signed with the same secret.
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt(
    { iat: now, exp: now + JWT_TTL_SECONDS, sub: 'unlocked' },
    proxyKey
  );

  return res.status(200).json({
    ok: true,
    token,
    expiresIn: JWT_TTL_SECONDS
  });
}
