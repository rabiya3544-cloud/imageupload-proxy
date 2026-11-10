// api/site-shot.js

const SITESHOT_URL = 'https://www.site-shot.com/screenshot/';

/* Static fallback when the client doesn't send navigator.userAgent */
const FALLBACK_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* Every parameter the proxy forwards.
   Client can override any of these; unset fields fall back to these values.
   `null` means "don't send" → Site-Shot uses its own internal default.
   `'mirror'` is a sentinel: resolved to the caller's `width` at request time. */
const DEFAULTS = {
  // output
  response_type:   'json',
  format:          'png',

  // viewport
  width:           1024,
  height:          768,
  zoom:            100,
  full_size:       0,
  max_height:      20000,
  scaled_width:    'mirror',

  // environment
  user_agent:      FALLBACK_UA,
  geolocation:     '0,0',
  time_zone:       'UTC',
  language:        'en',
  webgl:           1,
  fresh_session:   0,
  proxy_rotation:  0,

  // content filtering
  no_ads:          1,
  no_cookie_popup: 1,
  resolve_captcha: 0,
  http_referer:    null,
  request_headers: null,

  // timing
  delay_time:      1500,
  timeout:         50000,

  // advanced
  ready_variable:  false,
  source_code:     0,
  javascript_code: null,
  country:         null
};

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

  /* Resolve every parameter: client value > default */
  const params = {};
  for (const key of Object.keys(DEFAULTS)) {
    const provided = input[key];
    const isProvided = provided !== undefined && provided !== null && provided !== '';
    params[key] = isProvided ? provided : DEFAULTS[key];
  }
  console.log('RESOLVED PARAMS:', JSON.stringify(params));

  /* scaled_width = 'mirror' means "same as width" */
  if (params.scaled_width === 'mirror' || params.scaled_width === null) {
    params.scaled_width = params.width;
  }

  /* Build the upstream query string */
  const qs = new URLSearchParams();

  /* Fixed protocol fields — required by Site-Shot's web endpoint */
  qs.set('url', input.url);
  qs.set('src', 'web');
  qs.set('rnd', input.rnd || randId());
  qs.set('g-recaptcha-response', '');

  /* Emit every resolved parameter. null → skip so Site-Shot uses its own default */
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'boolean') {
      qs.set(k, v ? '1' : '0');
    } else if (Array.isArray(v)) {
      qs.set(k, JSON.stringify(v));
    } else {
      qs.set(k, String(v));
    }
  }

  const upstream = SITESHOT_URL + '?' + qs.toString();
  console.log('UPSTREAM URL:', upstream);

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
