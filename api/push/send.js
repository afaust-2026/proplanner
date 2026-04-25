// api/push/send.js
// Vercel Cron — runs daily at 8:00 AM CT (14:00 UTC)
// Sends push notifications for deadlines at 3 days, 1 day, and day-of
// Uses Web Push API with VAPID keys — no Firebase needed
//
// Required env vars:
//   VAPID_PUBLIC_KEY  — generated VAPID public key
//   VAPID_PRIVATE_KEY — generated VAPID private key
//   VAPID_SUBJECT     — mailto:hello@proplanscholar.com

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
const CRON_SECRET   = process.env.CRON_SECRET || '';
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@proplanscholar.com';

// ── Supabase REST helper ──────────────────────────────────────────────────────
async function supaFetch(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${await res.text()}`);
  return res.json();
}

// ── Days until helper ─────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return 999;
  const n = new Date(); n.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr + 'T00:00:00') - n) / 86400000);
}

// ── Base64url helpers for VAPID ───────────────────────────────────────────────
function b64urlToBuffer(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  return Buffer.from(padded, 'base64');
}

function bufferToB64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Generate VAPID Authorization header ──────────────────────────────────────
async function generateVAPIDAuth(audience) {
  const crypto = await import('crypto');
  
  const header = bufferToB64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = bufferToB64url(Buffer.from(JSON.stringify({
    aud: audience,
    exp: now + 12 * 3600,
    sub: VAPID_SUBJECT,
  })));

  const signingInput = `${header}.${payload}`;
  
  // Import private key
  const privateKeyBytes = b64urlToBuffer(VAPID_PRIVATE);
  const privateKey = crypto.default.createPrivateKey({
    key: privateKeyBytes,
    format: 'der',
    type: 'sec1',
  });

  const sign = crypto.default.createSign('SHA256');
  sign.update(signingInput);
  const derSig = sign.sign(privateKey);
  
  // Convert DER signature to raw R+S format
  // DER format: 30 len 02 rlen r 02 slen s
  let offset = 2; // skip 30 and length
  const rLen = derSig[offset + 1];
  const r = derSig.slice(offset + 2, offset + 2 + rLen).slice(-32);
  offset = offset + 2 + rLen;
  const sLen = derSig[offset + 1];
  const s = derSig.slice(offset + 2, offset + 2 + sLen).slice(-32);
  
  const rawSig = Buffer.concat([
    Buffer.concat([Buffer.alloc(32 - r.length), r]),
    Buffer.concat([Buffer.alloc(32 - s.length), s]),
  ]);
  
  const jwt = `${signingInput}.${bufferToB64url(rawSig)}`;
  return `vapid t=${jwt}, k=${VAPID_PUBLIC}`;
}

// ── Send Web Push notification ────────────────────────────────────────────────
async function sendWebPush(subscription, payload) {
  const sub = typeof subscription === 'string' ? JSON.parse(subscription) : subscription;
  const { endpoint, keys } = sub;
  
  // Extract audience from endpoint URL
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  
  const vapidAuth = await generateVAPIDAuth(audience);
  
  // Encrypt the payload using Web Push encryption
  // For simplicity, use unencrypted payload with text/plain
  // (works for Chrome/Firefox, some browsers require encryption)
  const body = JSON.stringify(payload);
  
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': vapidAuth,
      'Content-Type': 'application/json',
      'TTL': '86400',
    },
    body,
  });
  
  if (res.status === 410 || res.status === 404) {
    // Subscription expired — return flag to delete it
    return { expired: true };
  }
  
  if (!res.ok && res.status !== 201) {
    throw new Error(`Push failed: ${res.status} ${await res.text()}`);
  }
  
  return { success: true };
}

// ── Build notification content ────────────────────────────────────────────────
function buildNotification(assignment, courseName, days) {
  const title = assignment.title;
  const course = courseName || 'your course';

  if (days === 0) {
    return {
      title: '🚨 Due Today!',
      body: `"${title}" for ${course} is due today. Don't forget to submit!`,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      url: '/app#assignments',
      tag: `deadline-${assignment.id}`,
    };
  }
  if (days === 1) {
    return {
      title: '⚠️ Due Tomorrow',
      body: `"${title}" for ${course} is due tomorrow. Are you ready?`,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      url: '/app#assignments',
      tag: `deadline-${assignment.id}`,
    };
  }
  if (days === 3) {
    return {
      title: '📚 Deadline in 3 Days',
      body: `"${title}" for ${course} is due in 3 days. Check your study plan.`,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      url: '/app#assignments',
      tag: `deadline-${assignment.id}`,
    };
  }
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
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
    // Get all push subscriptions
    const subscriptions = await supaFetch('push_subscriptions', {
      select: 'user_id,subscription',
    });

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
            // Delete expired subscription
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
