// api/site-shot.js

const SITESHOT_URL = 'https://www.site-shot.com/screenshot/';

/* Every Site-Shot documented parameter is passed through if the caller sends it. */
const PASSTHROUGH_KEYS = [
  'width', 'height', 'zoom', 'full_size', 'max_height',
  'user_agent', 'scaled_width', 'format',
  'delay_time', 'timeout',
  'no_cookie_popup', 'no_ads', 'no_ads_no_cookie',
  'geolocation', 'time_zone', 'language', 'http_referer',
  'fresh_session', 'resolve_captcha', 'ready_variable',
  'source_code', 'webgl', 'country', 'javascript_code',
  'request_headers', 'proxy_rotation'
];

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
  if (!input.url) return res.status(400).json({ ok: false, error: 'url is required' });

  const qs = new URLSearchParams();
  qs.set('url', input.url);
  qs.set('src', 'web');
  qs.set('rnd', input.rnd || randId());
  qs.set('g-recaptcha-response', '');
  qs.set('response_type', 'json');

  /* Forward only what the caller actually sent */
  for (const k of PASSTHROUGH_KEYS) {
    const v = input[k];
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }

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
