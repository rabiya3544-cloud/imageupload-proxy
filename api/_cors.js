// api/_cors.js
// Shared CORS headers + OPTIONS short-circuit.
// Imported by every /api/* endpoint that the browser calls cross-origin.

export function applyCors(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || '*';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;   // caller should return immediately
  }
  return false;    // continue handling the real method
}
