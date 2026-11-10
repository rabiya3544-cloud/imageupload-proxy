// api/site-shot.js

const SITESHOT_URL = 'https://www.site-shot.com/screenshot/';

function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

function randId() {
  return String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const input = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const url   = input.url;
  if (!url) return res.status(400).json({ ok: false, error: 'url is required' });

  const qs = new URLSearchParams();
  qs.set('url',                 url);
  qs.set('width',               input.width        || '1080');
  qs.set('height',              input.height       || '2340');
  qs.set('zoom',                input.zoom         || '300');
  qs.set('scaled_width',        input.scaled_width || '1080');
  qs.set('full_size',           input.full_size   !== undefined ? String(input.full_size) : '');
  qs.set('format',              String(input.format || 'PNG').toUpperCase());
  qs.set('user_agent',          input.user_agent   || 'galaxy_a56');
  qs.set('no_ads_no_cookie',    input.no_ads_no_cookie || '1');
  qs.set('rnd',                 input.rnd          || randId());
  qs.set('src',                 'web');
  qs.set('g-recaptcha-response', '');

  const upstream = SITESHOT_URL + '?' + qs.toString();

  try {
    const r = await fetch(upstream, {
      method: 'GET',
      headers: {
        'User-Agent':      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://www.site-shot.com/'
      }
    });

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); }
    catch {
      return res.status(502).json({
        ok: false,
        error: 'Upstream returned non-JSON',
        upstreamStatus: r.status,
        bodyPreview: text.slice(0, 300)
      });
    }

    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        error: 'Upstream error (HTTP ' + r.status + ')',
        image: json.image,
        response: json.response,
        screenshot_parameters: json.screenshot_parameters
      });
    }

    return res.status(200).json({
      ok: true,
      image: json.image,
      response: json.response,
      screenshot_parameters: json.screenshot_parameters
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

export const config = { maxDuration: 60 };
