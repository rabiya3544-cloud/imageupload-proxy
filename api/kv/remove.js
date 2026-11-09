import { applyCors }    from '../_cors.js';
import { isAuthorized } from '../_kv-auth.js';
import { kv }           from '@vercel/kv';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST' && req.method !== 'DELETE')
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const id = req.body && req.body.id;
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });

  try {
    await kv.hdel('gallery:items', id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('kv remove error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'KV remove failed' });
  }
}
