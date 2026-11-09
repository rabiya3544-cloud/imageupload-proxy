export default function handler(req, res) {
  if (process.env.PROXY_ACCESS_KEY) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${process.env.PROXY_ACCESS_KEY}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }
  if (!process.env.IMAGEUPLOAD_API_KEY) {
    return res.status(500).json({ ok: false, error: 'IMAGEUPLOAD_API_KEY not configured' });
  }
  return res.status(200).json({ ok: true });
}
