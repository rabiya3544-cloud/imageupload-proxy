// api/_kv-auth.js
// Constant-time check that Authorization: Bearer <token> matches IMAGEUPLOAD_API_KEY.
// Anyone who can hit /api/auth and get the apiKey is authorized to write KV too.

function safeEq(a, b) {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export function isAuthorized(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const expected = process.env.IMAGEUPLOAD_API_KEY || '';
  if (!expected) return false;
  return safeEq(token, expected);
}
