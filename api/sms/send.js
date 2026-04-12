// api/sms/send.js
// Vercel Cron — runs daily at 8:00 AM CT (14:00 UTC)
// Sends SMS deadline reminders to users who have saved their phone number
// Reminds at: 3 days before, 1 day before, and day of due date
//
// Cron schedule in vercel.json: "0 14 * * *"

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM  = process.env.TWILIO_FROM || '';
const CRON_SECRET  = process.env.CRON_SECRET || '';
const IS_TRIAL     = process.env.TWILIO_TRIAL === 'true';

// ── Supabase REST helper ──────────────────────────────────────────────────────
async function supaFetch(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${await res.text()}`);
  return res.json();
}

// ── Send SMS via Twilio ───────────────────────────────────────────────────────
async function sendSMS(to, body) {
  // Normalize phone number to E.164 format
  const phone = to.replace(/\D/g, '');
  const e164 = phone.startsWith('1') ? `+${phone}` : `+1${phone}`;

  const params = new URLSearchParams({
    From: TWILIO_FROM,
    To: e164,
    Body: body,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(`Twilio error: ${data.message || JSON.stringify(data)}`);
  return data;
}

// ── Days until helper ─────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return 999;
  const n = new Date(); n.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr + 'T00:00:00') - n) / 86400000);
}

// ── Format date nicely ────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

// ── Build reminder message ────────────────────────────────────────────────────
function buildMessage(assignment, courseName, days) {
  const title = assignment.title;
  const course = courseName || 'your course';
  const date = formatDate(assignment.due_date);

  if (days === 0) {
    return `🚨 ProPlan Scholar: "${title}" for ${course} is DUE TODAY (${date})! Log in to mark it done: academicplan.pro/app`;
  }
  if (days === 1) {
    return `⚠️ ProPlan Scholar: "${title}" for ${course} is due TOMORROW (${date}). Stay on track: academicplan.pro/app`;
  }
  if (days === 3) {
    return `📚 ProPlan Scholar: "${title}" for ${course} is due in 3 days (${date}). Check your study plan: academicplan.pro/app`;
  }
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Security check
  const authHeader = req.headers['authorization'];
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  const results = { sent: 0, skipped: 0, errors: [] };

  try {
    // Get all users who have a phone number saved and SMS enabled
    const profiles = await supaFetch('profiles', {
      select: 'id,full_name,phone',
      'phone': 'not.is.null',
    });

    const activeProfiles = (profiles || []).filter(p => p.phone && p.phone.trim().length > 6);
    console.log(`Processing SMS for ${activeProfiles.length} users with phone numbers`);

    for (const profile of activeProfiles) {
      try {
        // Get pending assignments for this user
        const assignments = await supaFetch('assignments', {
          user_id: `eq.${profile.id}`,
          done: 'eq.false',
          select: 'id,title,due_date,course_id',
        });

        // Get their courses for names
        const courses = await supaFetch('courses', {
          user_id: `eq.${profile.id}`,
          select: 'id,name',
        });

        // Check each assignment for reminder triggers
        for (const assignment of (assignments || [])) {
          const days = daysUntil(assignment.due_date);

          // Only send at 3 days, 1 day, or day of
          if (![0, 1, 3].includes(days)) continue;

          const course = (courses || []).find(c => c.id === assignment.course_id);
          const message = buildMessage(assignment, course?.name, days);

          if (!message) continue;

          // In trial mode, Twilio can only text verified numbers
          // In production, remove this restriction
          if (IS_TRIAL) {
            console.log(`[TRIAL MODE] Would send to ${profile.phone}: ${message}`);
            results.sent++;
            continue;
          }

          await sendSMS(profile.phone, message);
          results.sent++;

          // Small delay to avoid Twilio rate limits
          await new Promise(r => setTimeout(r, 200));
        }

      } catch (userErr) {
        console.error(`SMS error for user ${profile.id}:`, userErr.message);
        results.errors.push({ uid: profile.id, error: userErr.message });
      }
    }

    return res.status(200).json({ success: true, ...results });

  } catch (err) {
    console.error('SMS cron error:', err);
    return res.status(500).json({ error: err.message, ...results });
  }
}
