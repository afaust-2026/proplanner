// api/claude/messages.js
// Server-side proxy for the Anthropic Messages API.
//
// WHY THIS EXISTS:
// The browser must NEVER hold the Anthropic API key — anyone who opens DevTools
// can read it from the bundled JavaScript and burn through your account.
// This proxy keeps the key on the server. The browser sends its Supabase login
// token; we verify the user is signed in, then forward to Anthropic using the
// SERVER-side env var ANTHROPIC_API_KEY.
//
// REQUIRED ENV VARS (set in Vercel → Settings → Environment Variables):
//   ANTHROPIC_API_KEY      — your Claude API key (server-only, NEVER prefix with VITE_)
//   VITE_SUPABASE_URL      — already set
//   VITE_SUPABASE_ANON     — already set (for verifying user JWTs)
//
// Body shape (matches Anthropic's POST /v1/messages):
//   { model, max_tokens, system?, messages, ...anything else Anthropic accepts }
//
// We pass it through unchanged. The proxy adds nothing, removes nothing.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY || '';
const SUPABASE_URL  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON || process.env.SUPABASE_ANON_KEY || '';

// Hard cap so a stolen JWT can't request 200k-token responses
const MAX_TOKENS_CAP = 8000;

async function getUserFromJWT(jwt) {
  if (!jwt || !SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch (_) {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS — same-origin in production, but allow OPTIONS preflight to be safe
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { type: 'method_not_allowed', message: 'Use POST.' } });
  }

  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: { type: 'server_misconfigured', message: 'ANTHROPIC_API_KEY is not set on the server. Contact the app owner.' } });
  }

  // Authenticate: only signed-in ProPlan Scholar users can use this proxy.
  // (Without auth, anyone could hit /api/claude/messages and burn through the key.)
  const auth = req.headers.authorization || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = await getUserFromJWT(jwt);
  if (!user || !user.id) {
    return res.status(401).json({ error: { type: 'unauthorized', message: 'Sign in to use AI features.' } });
  }

  // Parse body (Vercel may have already done this)
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: { type: 'bad_request', message: 'Body must be JSON.' } });
  }
  if (!body.model)    return res.status(400).json({ error: { type: 'bad_request', message: 'Missing "model".' } });
  if (!body.messages) return res.status(400).json({ error: { type: 'bad_request', message: 'Missing "messages".' } });

  // Cap max_tokens to protect against runaway abuse
  if (typeof body.max_tokens === 'number' && body.max_tokens > MAX_TOKENS_CAP) {
    body.max_tokens = MAX_TOKENS_CAP;
  }
  if (!body.max_tokens) body.max_tokens = 2000;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    // Pass status + JSON through transparently so the client can handle errors
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    return res.send(text);
  } catch (e) {
    console.error('claude proxy error:', e);
    return res.status(502).json({ error: { type: 'upstream_failed', message: e.message || String(e) } });
  }
};
