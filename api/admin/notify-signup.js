// api/admin/notify-signup.js
// Sends Angela an email each time a new student signs up.
//
// Called from the browser by AuthScreen.submit() right after a successful
// supabase.auth.signUp call. The browser POSTs:
//   { email: "student@university.edu", name: "Jane Doe" }
//
// We send via Resend using the existing RESEND_API_KEY env var.
//
// REQUIRED ENV VARS (already set in Vercel for the digest endpoint):
//   RESEND_API_KEY        — Resend API key (REDEPLOY after adding/changing this)
//
// OPTIONAL:
//   ADMIN_NOTIFY_EMAIL    — defaults to hello@proplanscholar.com
//   FROM_EMAIL            — defaults to "ProPlan Scholar <digest@proplanscholar.com>"
//                           (matching the working digest sender that Resend has
//                           verified for proplanscholar.com)

const RESEND_KEY  = process.env.RESEND_API_KEY || "";

const TO_EMAIL    = process.env.ADMIN_NOTIFY_EMAIL || "hello@proplanscholar.com";
const FROM_EMAIL  = process.env.FROM_EMAIL || "ProPlan Scholar <digest@proplanscholar.com>";

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"\x27]/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\x27":"&#39;",
  })[c]);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  if (!RESEND_KEY) {
    console.error("notify-signup: RESEND_API_KEY is not set on the server.");
    return res.status(500).json({ error: "RESEND_API_KEY not set on the server. Add it in Vercel and REDEPLOY." });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !body.email) return res.status(400).json({ error: "Missing email." });

  const email = String(body.email).trim();
  const name  = String(body.name || "").trim();

  const when = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f0ece3;font-family:-apple-system,\x27Segoe UI\x27,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;border:1px solid #e8e3d8;overflow:hidden;">
    <div style="background:#0e0e14;padding:20px 24px;color:#f0ece3;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(240,236,227,.6);margin-bottom:4px;">ProPlan Scholar — Admin Notice</div>
      <div style="font-size:20px;font-weight:700;">🎓 New student signup</div>
    </div>
    <div style="padding:22px 24px;color:#1a1820;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.7;">
        <tr><td style="color:#6b6880;width:90px;">Name</td><td style="font-weight:600;">${escapeHtml(name) || "<em style=\"color:#9a97a8;\">(not provided)</em>"}</td></tr>
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
      You\x27re receiving this because you\x27re the owner of ProPlan Scholar.
    </div>
  </div>
</body></html>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        // Drop the leading emoji from the subject — emojis up front are a known
        // spam-filter heuristic on Yahoo/Gmail. We keep the visual flair in the
        // body, where it does not hurt deliverability.
        subject: `New ProPlan Scholar signup: ${name || email}`,
        // Reply-To routes any reply to the new student, so you can welcome them
        // by simply hitting Reply in your inbox.
        reply_to: email,
        html,
        // Plain-text fallback — required for good Yahoo/Gmail deliverability.
        text: `New ProPlan Scholar signup\n\nName: ${name || "(not provided)"}\nEmail: ${email}\nWhen: ${when} CT\n\nThey will need to confirm their email before they can sign in.\n\nManage users at https://supabase.com/dashboard`,
        // Resend tag — lets you filter these messages in your Resend dashboard
        tags: [{ name: "category", value: "admin-signup-notification" }],
      }),
    });
    const respText = await r.text();
    if (!r.ok) {
      console.error("notify-signup Resend failed:", r.status, respText);
      return res.status(502).json({ error: `Resend error ${r.status}`, detail: respText });
    }
    console.log("notify-signup sent for", email);
    return res.status(200).json({ ok: true, sent: true });
  } catch (e) {
    console.error("notify-signup fatal:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
