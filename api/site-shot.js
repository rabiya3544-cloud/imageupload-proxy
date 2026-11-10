// api/site-shot.js

function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const input = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const upstreamUrl = input.upstream_url;

  if (!upstreamUrl) {
    return res.status(400).json({ ok: false, error: 'upstream_url is required' });
  }

  try {
    const r = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'User-Agent':      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://www.site-shot.com/'
      }
    });

    const diagnostics = {
      upstream_built: upstreamUrl,
      fetch_hit_url:  r.url,
      fetch_status:   r.status
    };

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); }
    catch {
      return res.status(502).json({
        ok: false,
        error: 'Upstream returned non-JSON',
        upstreamStatus: r.status,
        bodyPreview: text.slice(0, 300),
        diagnostics: diagnostics
      });
    }

    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        error: 'Upstream error (HTTP ' + r.status + ')',
        image: json.image,
        response: json.response,
        screenshot_parameters: json.screenshot_parameters,
        diagnostics: diagnostics
      });
    }

    return res.status(200).json({
      ok: true,
      image: json.image,
      response: json.response,
      screenshot_parameters: json.screenshot_parameters,
      diagnostics: diagnostics
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

export const config = { maxDuration: 60 };
