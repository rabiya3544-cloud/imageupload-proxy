export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (process.env.PROXY_ACCESS_KEY) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${process.env.PROXY_ACCESS_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized proxy request' });
    }
  }

  try {
    const body = req.body || {};
    if (!body.url) return res.status(400).json({ error: 'url is required' });

    const upstream = await fetch('https://imageupload.app/api/1/screenshot', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.IMAGEUPLOAD_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error('screenshot proxy error:', err);
    return res.status(500).json({ error: err.message || 'Screenshot proxy failed' });
  }
}
