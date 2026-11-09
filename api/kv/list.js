import { applyCors }    from '../_cors.js';
import { isAuthorized } from '../_kv-auth.js';
import { redis }        from '../_redis.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  try {
    const hash = (await redis.hgetall('gallery:items')) || {};
    const items = Object.values(hash)
      .map(v => {
        try { return typeof v === 'string' ? JSON.parse(v) : v; }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => (b.time || 0) - (a.time || 0));

    return res.status(200).json({ ok: true, items, count: items.length });
  } catch (err) {
    console.error('kv list error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'KV list failed' });
  }
}
