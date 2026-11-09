import formidable from 'formidable';
import fs from 'fs';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Optional shared-secret gate (set PROXY_ACCESS_KEY in env to enable)
  if (process.env.PROXY_ACCESS_KEY) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${process.env.PROXY_ACCESS_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized proxy request' });
    }
  }

  try {
    const form = formidable({ maxFileSize: 32 * 1024 * 1024, multiples: true });
    const [, files] = await form.parse(req);

    const list = Array.isArray(files.images) ? files.images : files.images ? [files.images] : [];
    if (!list.length) return res.status(400).json({ error: 'No image file provided' });
    if (list.length > 15) return res.status(400).json({ error: 'Maximum 15 files per request' });

    const fd = new FormData();
    fd.append('key', process.env.IMAGEUPLOAD_API_KEY);
    for (const f of list) {
      const buf = fs.readFileSync(f.filepath);
      fd.append('images', new Blob([buf], { type: f.mimetype }), f.originalFilename || 'upload');
    }

    const upstream = await fetch('https://imageupload.app/api/1/upload', { method: 'POST', body: fd });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error('upload proxy error:', err);
    return res.status(500).json({ error: err.message || 'Upload proxy failed' });
  }
}
