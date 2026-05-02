// api/admin/notify-signup.js
// Sends Angela an email each time a new student signs up.
//
// Called from the browser by AuthScreen.submit() right after a successful
// supabase.auth.signUp call. The browser POSTs:
//   { email: "student@university.edu", name: "Jane Doe" }
//
// We send via Resend using the existing RESEND_API_KEY env var.
// To avoid spammers triggering this with fake data, we double-check that the
// account actually exists in auth.users via the Supabase service-role key.
//
// REQUIRED ENV VARS (already set in Vercel for the digest endpoint):
//   RESEND_API_KEY        — Resend API key
//   VITE_SUPABASE_URL     — already set
//   SUPABASE_SERVICE_KEY  — already set
//
// OPTIONAL:
//   ADMIN_NOTIFY_EMAIL    — defaults to hello@proplanscholar.com
//   FROM_EMAIL            — defaults to "ProPlan Scholar <noreply@proplanscholar.com>"

const RESEND_KEY  = process.env.RESEND_API_KEY || '';
const SUPA_URL    = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY || '';

const TO_EMAIL    = process.env.ADMIN_NOTIFY_EMAIL || 'hello@proplanscholar.com';
const FROM_EMAIL  = process.env.FROM_EMAIL || 'ProPlan Scholar <noreply@proplanscholar.com>';

async function userExists(email) {
  // Use the Admin API to look up a user by email.
  // listUsers returns up to 50 users at a time; we filter by email.
  // For low-volume early days this is fine; once you have thousands of users we
  // could switch to a single-user lookup endpoint.
  if (!SUPA_URL || !SUPA_SERVICE) return true; // best-effort if env missing
  try {
    const url = `${SUPA_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
    const r = await fetch(url, {
      headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}` },
    });
    if (!r.ok) return false;
    const data = await r.json();
    return Array.isArray(data?.users) && data.users.length > 0;
  } catch (_) {
    return true; // don't block notifications on a transient lookup failure
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  })[c]);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  if (!RESEND_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY not set on the server.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !body.email) return res.status(400).json({ error: 'Missing email.' });

  const email = String(body.email).trim();
  const name  = String(body.name || '').trim();

  // Light spam-prevention: confirm the account actually exists. If it doesn't,
  // silently 200 so the client doesn't see anything weird, but skip the email.
  const exists = await userExists(email);
  if (!exists) {
    return res.status(200).json({ ok: true, sent: false, reason: 'unconfirmed-user' });
  }

  const when = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f0ece3;font-family:-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;border:1px solid #e8e3d8;overflow:hidden;">
    <div style="background:#0e0e14;padding:20px 24px;color:#f0ece3;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(240,236,227,.6);margin-bottom:4px;">ProPlan Scholar — Admin Notice</div>
      <div style="font-size:20px;font-weight:700;">🎓 New student signup</div>
    </div>
    <div style="padding:22px 24px;color:#1a1820;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.7;">
        <tr><td style="color:#6b6880;width:90px;">Name</td><td style="font-weight:600;">${escapeHtml(name) || '<em style="color:#9a97a8;">(not provided)</em>'}</td></tr>
        <tr><td style="color:#6b6880;">Email</td><td style="font-weight:600;"><a href="mailto:${escapeHtml(email)}" style="color:#C75B12;text-decoration:none;">${escapeHtml(email)}</a></td></tr>
        <tr><td style="color:#6b6880;">When</td><td>${escapeHtml(when)} CT</td></tr>
      </table>
      <div style="margin-top:18px;padding:12px 14px;background:#f7f5f0;border-radius:9px;font-size:12px;color:#6b6880;line-height:1.6;">
        💡 They will need to confirm their email address before they can sign in. Once confirmed, they will land on the onboarding flow.
      </div>
      <div style="margin-top:14px;font-size:12px;color:#6b6880;">
        Manage users at the <a href="https://supabase.com/dashboard" style="color:#C75B12;text-decoration:none;">Supabase dashboard</a>.
      </div>
    </div>
    <div style="padding:14px 24px;background:#0e0e14;color:rgba(240,236,227,.4);font-size:10px;text-align:center;">
      You're receiving this because you're the owner of ProPlan Scholar. To stop these emails, remove the call to /api/admin/notify-signup from src/DBAPlanner.jsx.
    </div>
  </div>
</body></html>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        subject: `🎓 New ProPlan Scholar signup: ${name || email}`,
        html,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('Resend send failed:', r.status, t);
      return res.status(502).json({ error: `Resend error ${r.status}`, detail: t });
    }
    return res.status(200).json({ ok: true, sent: true });
  } catch (e) {
    console.error('notify-signup error:', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
