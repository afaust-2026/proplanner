// api/push/send.js
// Vercel Cron — runs daily at 8:00 AM CT (14:00 UTC)
// Uses web-push npm package for proper Web Push encryption

import webpush from 'web-push';

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

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const results = { sent: 0, skipped: 0, expired: 0, errors: [] };

  try {
    const subscriptions = await supaFetch('push_subscriptions', { select: 'user_id,subscription' });
    console.log(`Processing push notifications for ${subscriptions.length} subscribers`);

    for (const sub of (subscriptions || [])) {
      try {
        const subscription = typeof sub.subscription === 'string' ? JSON.parse(sub.subscription) : sub.subscription;
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
          try {
            await webpush.sendNotification(subscription, JSON.stringify(notification), { TTL: 86400 });
            sentCount++;
          } catch (pushErr) {
            if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
              await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${sub.user_id}`, {
                method: 'DELETE',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
              });
              results.expired++;
              break;
            }
            throw pushErr;
          }
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
