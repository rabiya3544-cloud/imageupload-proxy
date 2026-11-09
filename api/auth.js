// api/auth.js
import { applyCors }      from './_cors.js';
import { decryptBundle }  from './_crypto.js';

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
  const apiKey     = process.env.IMAGEUPLOAD_API_KEY;

  if (!iv || !salt || !ciphertext) {
    return res.status(500).json({ ok: false, error: 'Auth bundle not configured' });
  }
  if (!proxyKey) {
    return res.status(500).json({ ok: false, error: 'PROXY_ACCESS_KEY not configured' });
  }
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'IMAGEUPLOAD_API_KEY not configured' });
  }

  /* 1) Decrypt the env vault with the submitted password.
        Wrong password → AES-GCM tag mismatch → throws. */
  let plaintext;
  try {
    plaintext = await decryptBundle({ iv, salt, ciphertext }, password);
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid password' });
  }

  /* 2) Sanity-check: decrypted value must equal PROXY_ACCESS_KEY. */
  if (!timingSafeEqual(plaintext, proxyKey)) {
    return res.status(401).json({ ok: false, error: 'Invalid password' });
  }

  /* 3) Hand out the real ImageUpload.app API key.
        The client will use it for direct uploads to imageupload.app. */
  return res.status(200).json({
    ok: true,
    apiKey: apiKey
  });
}
