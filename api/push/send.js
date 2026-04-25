// api/push/send.js
// Vercel Cron — runs daily at 8:00 AM CT (14:00 UTC)
// Sends push notifications for deadlines at 3 days, 1 day, and day-of
// Uses Web Crypto API for VAPID signing — no external dependencies

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
const CRON_SECRET   = process.env.CRON_SECRET || '';
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@proplanscholar.com';

async function supaFetch(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${await res.text()}`);
  return res.json();
}

function daysUntil(dateStr) {
  if (!dateStr) return 999;
  const n = new Date(); n.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr + 'T00:00:00') - n) / 86400000);
}

function b64urlToUint8(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  return Uint8Array.from(Buffer.from(padded, 'base64'));
}

function uint8ToB64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateVAPIDJWT(audience) {
  const header = uint8ToB64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = uint8ToB64url(Buffer.from(JSON.stringify({
    aud: audience, exp: now + 12 * 3600, sub: VAPID_SUBJECT,
  })));
  const signingInput = `${header}.${payload}`;

  const rawPrivateKey = b64urlToUint8(VAPID_PRIVATE);
  const rawPublicKey  = b64urlToUint8(VAPID_PUBLIC);

  // Public key: 0x04 + 32 bytes X + 32 bytes Y
  const x = uint8ToB64url(rawPublicKey.slice(1, 33));
  const y = uint8ToB64url(rawPublicKey.slice(33, 65));
  const d = uint8ToB64url(rawPrivateKey);

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${uint8ToB64url(new Uint8Array(signature))}`;
  return `vapid t=${jwt}, k=${VAPID_PUBLIC}`;
}

async function sendWebPush(subscriptionStr, payload) {
  const sub = typeof subscriptionStr === 'string' ? JSON.parse(subscriptionStr) : subscriptionStr;
  const { endpoint } = sub;
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const vapidAuth = await generateVAPIDJWT(audience);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': vapidAuth, 'Content-Type': 'application/json', 'TTL': '86400' },
    body: JSON.stringify(payload),
  });

  if (res.status === 410 || res.status === 404) return { expired: true };
  if (!res.ok && res.status !== 201) {
    throw new Error(`Push failed ${res.status}: ${await res.text()}`);
  }
  return { success: true };
}

function buildNotification(assignment, courseName, days) {
  const title = assignment.title;
  const course = courseName || 'your course';
  if (days === 0) return { title: '🚨 Due Today!', body: `"${title}" for ${course} is due today!`, icon: '/favicon.svg', badge: '/favicon.svg', url: '/app#assignments', tag: `deadline-${assignment.id}` };
  if (days === 1) return { title: '⚠️ Due Tomorrow', body: `"${title}" for ${course} is due tomorrow.`, icon: '/favicon.svg', badge: '/favicon.svg', url: '/app#assignments', tag: `deadline-${assignment.id}` };
  if (days === 3) return { title: '📚 Deadline in 3 Days', body: `"${title}" for ${course} is due in 3 days.`, icon: '/favicon.svg', badge: '/favicon.svg', url: '/app#assignments', tag: `deadline-${assignment.id}` };
  return null;
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  const results = { sent: 0, skipped: 0, expired: 0, errors: [] };

  try {
    const subscriptions = await supaFetch('push_subscriptions', { select: 'user_id,subscription' });
    console.log(`Processing push notifications for ${subscriptions.length} subscribers`);

    for (const sub of (subscriptions || [])) {
      try {
        const [assignments, courses] = await Promise.all([
          supaFetch('assignments', { user_id: `eq.${sub.user_id}`, done: 'eq.false', select: '*' }),
          supaFetch('courses', { user_id: `eq.${sub.user_id}`, select: 'id,name' }),
        ]);

        let sentCount = 0;
        for (const assignment of (assignments || [])) {
          const days = daysUntil(assignment.due_date);
          if (![0, 1, 3].includes(days)) continue;
          const course = (courses || []).find(c => c.id === assignment.course_id);
          const notification = buildNotification(assignment, course?.name, days);
          if (!notification) continue;
          const result = await sendWebPush(sub.subscription, notification);
          if (result.expired) {
            await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${sub.user_id}`, {
              method: 'DELETE',
              headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
            });
            results.expired++;
            break;
          }
          sentCount++;
          await new Promise(r => setTimeout(r, 100));
        }
        results.sent += sentCount;
        if (sentCount === 0) results.skipped++;
      } catch (err) {
        console.error(`Push error for user ${sub.user_id}:`, err.message);
        results.errors.push({ uid: sub.user_id, error: err.message });
      }
    }
    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error('Push cron error:', err);
    return res.status(500).json({ error: err.message, ...results });
  }
}
