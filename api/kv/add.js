import { applyCors }    from '../_cors.js';
import { isAuthorized } from '../_kv-auth.js';
import { redis }        from '../_redis.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const item = req.body && req.body.item;
  if (!item || !item.id) return res.status(400).json({ ok: false, error: 'item with id required' });

  try {
    await redis.hset('gallery:items', { [item.id]: JSON.stringify(item) });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('kv add error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'KV add failed' });
  }
}
