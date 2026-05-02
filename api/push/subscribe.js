// api/push/subscribe.js
// Saves a browser PushSubscription to Supabase so the cron can later send pushes to it.
//
// Called from the browser when a student taps "Enable Push Notifications".
// The browser supplies its own Authorization header with the user's Supabase JWT
// so we know who they are; we then write a row to push_subscriptions using the
// service-role key.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON || process.env.SUPABASE_ANON_KEY || '';

async function getUserFromJWT(jwt) {
  if (!jwt) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function supaWrite(table, body, method = 'POST', extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  // CORS — browser will send POST from our own origin in production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server is missing SUPABASE_URL / SUPABASE_SERVICE_KEY env vars.' });
  }

  // Pull user JWT from Authorization header
  const auth = req.headers.authorization || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = await getUserFromJWT(jwt);
  if (!user || !user.id) {
    return res.status(401).json({ error: 'Not authenticated. Sign in and try again.' });
  }

  // Body shape: { subscription: { endpoint, keys: { p256dh, auth } }, userAgent? }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  if (req.method === 'POST') {
    const sub = body.subscription || {};
    const endpoint = sub.endpoint;
    const p256dh = sub.keys?.p256dh;
    const authKey = sub.keys?.auth;
    if (!endpoint || !p256dh || !authKey) {
      return res.status(400).json({ error: 'Missing subscription fields (endpoint, keys.p256dh, keys.auth).' });
    }
    try {
      await supaWrite('push_subscriptions', [{
        user_id: user.id,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: body.userAgent || req.headers['user-agent'] || '',
        last_used: new Date().toISOString(),
      }], 'POST');
      // Also flip the user's preference flag on profiles
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ push_enabled: true }),
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('subscribe error:', e);
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  if (req.method === 'DELETE') {
    const endpoint = body.endpoint || (req.query && req.query.endpoint);
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint to unsubscribe.' });
    }
    try {
      const url = `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${user.id}&endpoint=eq.${encodeURIComponent(endpoint)}`;
      const r = await fetch(url, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      });
      if (!r.ok) throw new Error(await r.text());
      // If user has no remaining subscriptions, flip preference off
      const remaining = await fetch(
        `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${user.id}&select=id`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const rows = await remaining.json();
      if (Array.isArray(rows) && rows.length === 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ push_enabled: false }),
        });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('unsubscribe error:', e);
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use POST to subscribe, DELETE to unsubscribe.' });
};
