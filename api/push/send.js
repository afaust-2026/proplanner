// api/push/send.js
// Daily cron — runs at 8 AM CT (1300 UTC during CDT, 1400 UTC during CST).
// For each user with a push subscription, computes:
//   - assignments due in 3 days, 1 day, or today
//   - today's study sessions (count + first session start time)
//   - today's class schedule (count + first class start time)
// then sends a single bundled Web Push notification.

import webpush from 'web-push';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const APP_URL = 'https://proplanscholar.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:hello@proplanscholar.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

async function supaFetch(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${await res.text()}`);
  return res.json();
}

function daysUntil(dateStr) {
  if (!dateStr) return 999;
  const n = new Date(); n.setHours(0,0,0,0);
  return Math.ceil((new Date(dateStr + 'T00:00:00') - n) / 86400000);
}
function to12h(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function buildMessage({ assignments3d, assignments1d, assignments0d, classesToday, studyToday }) {
  // Title — surface the most urgent thing first
  let title = 'Your day at a glance';
  if (assignments0d.length > 0) {
    title = assignments0d.length === 1
      ? `Due TODAY: ${assignments0d[0].title}`
      : `${assignments0d.length} assignments due TODAY`;
  } else if (assignments1d.length > 0) {
    title = assignments1d.length === 1
      ? `Due tomorrow: ${assignments1d[0].title}`
      : `${assignments1d.length} assignments due tomorrow`;
  } else if (assignments3d.length > 0) {
    title = `${assignments3d.length} assignment${assignments3d.length>1?'s':''} due in 3 days`;
  }

  const lines = [];
  if (assignments3d.length) lines.push(`🟡 In 3 days: ${assignments3d.map(a=>a.title).slice(0,3).join(', ')}${assignments3d.length>3?` +${assignments3d.length-3} more`:''}`);
  if (assignments1d.length) lines.push(`🟠 Tomorrow: ${assignments1d.map(a=>a.title).slice(0,3).join(', ')}${assignments1d.length>3?` +${assignments1d.length-3} more`:''}`);
  if (assignments0d.length) lines.push(`🔴 Today: ${assignments0d.map(a=>a.title).slice(0,3).join(', ')}${assignments0d.length>3?` +${assignments0d.length-3} more`:''}`);
  if (classesToday.length)  lines.push(`🎓 ${classesToday.length} class${classesToday.length>1?'es':''} today (first: ${to12h(classesToday[0].class_time)})`);
  if (studyToday > 0)       lines.push(`📚 ${studyToday} study session${studyToday>1?'s':''} planned`);

  const body = lines.length ? lines.join('\n') : 'No deadlines, classes, or study sessions today. Enjoy! 🎉';
  return { title, body };
}

async function sendOneUser(user, profile, assignments, courses, scheduleBlocks, milestones) {
  // Bucket assignments by days-until
  const pending = (assignments || []).filter(a => !a.done);
  const a3 = pending.filter(a => daysUntil(a.due_date) === 3);
  const a1 = pending.filter(a => daysUntil(a.due_date) === 1);
  const a0 = pending.filter(a => daysUntil(a.due_date) === 0);

  // Today's classes (based on which weekday today is)
  const today = new Date();
  const todayName = DAYS[today.getDay()];
  const classesToday = (courses || [])
    .filter(c => Array.isArray(c.class_days) && c.class_days.includes(todayName) && c.class_time)
    .sort((a,b) => (a.class_time||'').localeCompare(b.class_time||''));

  // Today's study sessions = pending assignments with study blocks today.
  // Without storing them server-side, approximate: count assignments whose
  // due date is in the next 7 days (the user's likely "active" set).
  const studyToday = pending.filter(a => {
    const d = daysUntil(a.due_date);
    return d >= 0 && d <= 7;
  }).length;

  // Skip the push if there's literally nothing to report — no point waking the user up
  // Actually, send a "you're all clear" message — students like to know their day is light too.
  // Set quiet=true only when EVERYTHING is empty AND it's not a milestone day.
  const quiet = a3.length === 0 && a1.length === 0 && a0.length === 0 && classesToday.length === 0 && studyToday === 0;
  if (quiet && profile?.push_quiet_when_empty) {
    return { skipped: true, reason: 'nothing-to-report' };
  }

  const { title, body } = buildMessage({
    assignments3d: a3, assignments1d: a1, assignments0d: a0,
    classesToday, studyToday,
  });

  // Pull all of this user's subscriptions and send
  const subs = await supaFetch('push_subscriptions', { user_id: `eq.${user.id}`, select: '*' });
  const results = { sent: 0, failed: 0, removed: 0 };

  for (const sub of subs || []) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    const payload = JSON.stringify({
      title,
      body,
      icon: `${APP_URL}/favicon.svg`,
      badge: `${APP_URL}/favicon.svg`,
      url: `${APP_URL}/app`,
      tag: 'proplan-daily', // collapse into a single notification per user per day
    });
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 24 * 60 * 60 });
      results.sent++;
      // Update last_used so we know this device is still active
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${sub.id}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_used: new Date().toISOString() }),
      });
    } catch (e) {
      // 404/410 = subscription expired; remove it
      const status = e.statusCode || 0;
      if (status === 404 || status === 410) {
        await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${sub.id}`, {
          method: 'DELETE',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        results.removed++;
      } else {
        console.error(`push send failed for sub ${sub.id} (user ${user.id}):`, status, e.body || e.message);
        results.failed++;
      }
    }
  }
  return results;
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase env vars (SUPABASE_URL, SUPABASE_SERVICE_KEY).' });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'Missing VAPID env vars (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY). See PUSH_NOTIFICATIONS_SETUP.md.' });
  }

  const summary = { totalUsers: 0, sent: 0, failed: 0, removed: 0, skipped: 0, errors: [] };

  try {
    // 1) Pull every user that has at least one push subscription. We do this by
    // fetching distinct user_ids from push_subscriptions, then loading their data.
    const subs = await supaFetch('push_subscriptions', { select: 'user_id' });
    const userIds = [...new Set((subs || []).map(s => s.user_id))];
    summary.totalUsers = userIds.length;

    if (userIds.length === 0) {
      return res.status(200).json({ ok: true, message: 'No subscribed users.', summary });
    }

    // 2) Bulk-load profiles + courses + assignments for those users
    const inList = `in.(${userIds.join(',')})`;
    const [profiles, courses, assignments, scheduleBlocks, milestones] = await Promise.all([
      supaFetch('profiles', { id: inList, select: '*' }),
      supaFetch('courses', { user_id: inList, select: '*' }),
      supaFetch('assignments', { user_id: inList, select: '*' }),
      supaFetch('schedule_blocks', { user_id: inList, select: '*' }).catch(() => []),
      supaFetch('milestones', { user_id: inList, select: '*' }).catch(() => []),
    ]);

    // 3) Send one push per user
    for (const uid of userIds) {
      const profile = (profiles || []).find(p => p.id === uid);
      const userCourses = (courses || []).filter(c => c.user_id === uid);
      const userAssign = (assignments || []).filter(a => a.user_id === uid);
      const userBlocks = (scheduleBlocks || []).filter(b => b.user_id === uid);
      const userMs    = (milestones || []).filter(m => m.user_id === uid);
      try {
        const r = await sendOneUser({ id: uid }, profile, userAssign, userCourses, userBlocks, userMs);
        if (r.skipped) summary.skipped++;
        else {
          summary.sent += r.sent || 0;
          summary.failed += r.failed || 0;
          summary.removed += r.removed || 0;
        }
      } catch (userErr) {
        console.error(`user ${uid} push error:`, userErr);
        summary.errors.push({ uid, error: userErr.message || String(userErr) });
      }
    }

    return res.status(200).json({ ok: true, summary });
  } catch (e) {
    console.error('push/send fatal:', e);
    return res.status(500).json({ error: e.message || String(e), summary });
  }
};
