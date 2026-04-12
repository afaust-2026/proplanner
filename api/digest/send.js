// api/digest/send.js
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const RESEND_KEY   = process.env.RESEND_API_KEY || '';
const FROM_EMAIL   = process.env.FROM_EMAIL || 'ProPlan Scholar <digest@proplanscholar.com>';
const APP_URL      = 'https://academicplan.pro';

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
  const n = new Date(); n.setHours(0,0,0,0);
  return Math.ceil((new Date(dateStr + 'T00:00:00') - n) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function to12h(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function urgencyColor(days) {
  if (days <= 0) return '#ef4444';
  if (days <= 2) return '#f97316';
  if (days <= 7) return '#eab308';
  return '#6b7280';
}

function getWeekStudyBlocks(assignments, courses) {
  const blocks = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dailyNext = {};
  const pending = (assignments||[])
    .filter(a => !a.done && a.due_date && daysUntil(a.due_date) >= 0)
    .sort((a,b) => new Date(a.due_date) - new Date(b.due_date));
  for (const a of pending) {
    const course = (courses||[]).find(c => c.id === a.course_id);
    const diff = course?.difficulty || 3;
    const sessions = Math.ceil((a.est_hours||2)*(diff/3)/2);
    let placed = 0;
    let day = new Date(today);
    const due = new Date(a.due_date+'T00:00:00');
    while (placed < sessions && day < due && day < weekEnd) {
      const ds = day.toISOString().slice(0,10);
      const startH = Math.max(18, dailyNext[ds]||18);
      const endH = startH + 2;
      if (endH <= 22) {
        blocks.push({ date:ds, dayName:DAYS[day.getDay()], startTime:`${String(startH).padStart(2,'0')}:00`, endTime:`${String(endH).padStart(2,'0')}:00`, title:a.title, courseName:course?.name||'', courseColor:course?.color||'#6366f1' });
        dailyNext[ds] = endH;
        placed++;
      }
      day.setDate(day.getDate()+1);
    }
  }
  return blocks.sort((a,b) => a.date.localeCompare(b.date));
}

function buildEmailHTML({ profile, courses, assignments, milestones, studyBlocks, unsubUrl }) {
  const name = profile.full_name?.split(' ')[0] || 'Student';
  const uniName = profile.university_name || profile.university || 'Your University';
  const deadlines = (assignments||[])
    .filter(a => !a.done && a.due_date)
    .map(a => ({...a, days:daysUntil(a.due_date), course:(courses||[]).find(c=>c.id===a.course_id)}))
    .filter(a => a.days >= -1 && a.days <= 14)
    .sort((a,b) => a.days - b.days)
    .slice(0,8);
  const overdue = (assignments||[]).filter(a => !a.done && a.due_date && daysUntil(a.due_date) < 0).slice(0,4);
  const nextMilestone = (milestones||[]).filter(m=>!m.done&&m.due_date).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date))[0];
  const totalPending = (assignments||[]).filter(a=>!a.done).length;
  const totalDone = (assignments||[]).filter(a=>a.done).length;
  const weekStudyHrs = studyBlocks.length * 2;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Your Week Ahead — ProPlan Scholar</title>
<style>
  body{margin:0;padding:0;background:#f0ece3;font-family:'Helvetica Neue',Arial,sans-serif;}
  .wrapper{max-width:600px;margin:0 auto;padding:24px 16px;}
  .header{background:#0e0e14;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;}
  .header-logo{font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(240,236,227,.5);margin-bottom:6px;}
  .header-title{font-size:26px;font-weight:700;color:#f0ece3;margin-bottom:4px;}
  .header-sub{font-size:14px;color:rgba(240,236,227,.55);}
  .body{background:#ffffff;padding:28px 32px;}
  .section{margin-bottom:28px;}
  .section-label{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#c75b12;margin-bottom:12px;}
  .greeting{font-size:22px;font-weight:700;color:#0e0e14;margin-bottom:6px;}
  .greeting-sub{font-size:14px;color:#6b6560;line-height:1.6;}
  .stats-row{display:flex;gap:10px;margin-bottom:4px;flex-wrap:wrap;}
  .stat-box{flex:1;min-width:100px;background:#f7f5f0;border-radius:10px;padding:12px 10px;text-align:center;border:1px solid #e8e3d8;}
  .stat-num{font-size:22px;font-weight:700;color:#c75b12;}
  .stat-label{font-size:10px;color:#6b6560;margin-top:2px;text-transform:uppercase;letter-spacing:.5px;}
  .deadline-item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f0ece3;}
  .deadline-dot{width:4px;height:36px;border-radius:2px;flex-shrink:0;}
  .deadline-title{font-size:14px;font-weight:600;color:#0e0e14;margin-bottom:2px;}
  .deadline-course{font-size:11px;color:#6b6560;}
  .deadline-badge{font-size:11px;font-weight:700;flex-shrink:0;padding:3px 8px;border-radius:6px;}
  .study-item{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f7f5f0;border-radius:8px;margin-bottom:6px;}
  .study-time{font-size:12px;font-weight:700;color:#0e0e14;min-width:110px;}
  .day-header{font-size:12px;font-weight:700;color:#c75b12;text-transform:uppercase;letter-spacing:1px;margin:12px 0 6px;}
  .overdue-box{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin-bottom:20px;}
  .overdue-title{font-size:13px;font-weight:700;color:#dc2626;margin-bottom:8px;}
  .overdue-item{font-size:12px;color:#7f1d1d;padding:3px 0;}
  .milestone-box{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px 16px;}
  .cta-btn{display:block;background:#c75b12;color:#ffffff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:100px;font-size:14px;font-weight:700;margin:20px 0;}
  .footer{background:#0e0e14;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;}
  .footer p{font-size:11px;color:rgba(240,236,227,.4);margin:0 0 6px;}
  .footer a{color:rgba(240,236,227,.5);text-decoration:none;}
  .divider{height:1px;background:#f0ece3;margin:20px 0;}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="header-logo">ProPlan Scholar</div>
    <div class="header-title">Your Week Ahead</div>
    <div class="header-sub">${uniName} · Week of ${formatDate(new Date().toISOString().slice(0,10))}</div>
  </div>
  <div class="body">
    <div class="section">
      <div class="greeting">Good evening, ${name}! 👋</div>
      <div class="greeting-sub">Here's your ProPlan Scholar digest for the week ahead. Stay on top of your schedule and you've got this.</div>
    </div>
    <div class="section">
      <div class="section-label">At a Glance</div>
      <div class="stats-row">
        <div class="stat-box"><div class="stat-num">${courses?.length||0}</div><div class="stat-label">Courses</div></div>
        <div class="stat-box"><div class="stat-num" style="color:#f97316;">${totalPending}</div><div class="stat-label">Pending</div></div>
        <div class="stat-box"><div class="stat-num" style="color:#0ea5e9;">${weekStudyHrs}h</div><div class="stat-label">Study This Week</div></div>
        <div class="stat-box"><div class="stat-num" style="color:#22c55e;">${totalDone}</div><div class="stat-label">Completed</div></div>
      </div>
    </div>
    ${overdue.length > 0 ? `
    <div class="overdue-box">
      <div class="overdue-title">⚠️ ${overdue.length} Overdue Assignment${overdue.length>1?'s':''}</div>
      ${overdue.map(a=>`<div class="overdue-item">📌 ${a.title} — ${(courses||[]).find(c=>c.id===a.course_id)?.name||''}</div>`).join('')}
    </div>` : ''}
    ${deadlines.length > 0 ? `
    <div class="section">
      <div class="section-label">Upcoming Deadlines</div>
      ${deadlines.map(a=>`
      <div class="deadline-item">
        <div class="deadline-dot" style="background:${a.course?.color||'#6366f1'};"></div>
        <div style="flex:1;min-width:0;">
          <div class="deadline-title">${a.title}</div>
          <div class="deadline-course">${a.course?.name||''} · ${formatDate(a.due_date)}</div>
        </div>
        <div class="deadline-badge" style="color:${urgencyColor(a.days)};background:${urgencyColor(a.days)}15;">
          ${a.days<=0?'Overdue':a.days===1?'Tomorrow':`${a.days} days`}
        </div>
      </div>`).join('')}
    </div>` : `
    <div class="section">
      <div class="section-label">Upcoming Deadlines</div>
      <p style="font-size:14px;color:#6b6560;">🎉 No deadlines in the next 2 weeks!</p>
    </div>`}
    ${studyBlocks.length > 0 ? `
    <div class="section">
      <div class="section-label">Study Sessions This Week</div>
      ${(()=>{let html='',lastDay='';for(const b of studyBlocks){if(b.dayName!==lastDay){html+=`<div class="day-header">${b.dayName} ${b.date.slice(8)}</div>`;lastDay=b.dayName;}html+=`<div class="study-item"><span style="font-size:16px;">📚</span><div style="flex:1;"><div style="font-size:13px;font-weight:600;color:#0e0e14;">${b.title}</div><div style="font-size:11px;color:#6b6560;">${b.courseName}</div></div><div class="study-time">${to12h(b.startTime)} – ${to12h(b.endTime)}</div></div>`;}return html;})()}
    </div>` : ''}
    ${nextMilestone ? `
    <div class="section">
      <div class="section-label">Next Milestone</div>
      <div class="milestone-box">
        <div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:4px;">⬟ Dissertation / Major Project</div>
        <div style="font-size:14px;font-weight:600;color:#0e0e14;">${nextMilestone.title}</div>
        <div style="font-size:12px;color:#6b6560;margin-top:4px;">${formatDate(nextMilestone.due_date)} · ${daysUntil(nextMilestone.due_date)} days away</div>
        ${nextMilestone.notes?`<div style="font-size:12px;color:#6b6560;margin-top:6px;">${nextMilestone.notes}</div>`:''}
      </div>
    </div>` : ''}
    <div style="text-align:center;">
      <a href="${APP_URL}/app" class="cta-btn">Open ProPlan Scholar →</a>
    </div>
    <div class="divider"></div>
    <div style="font-size:12px;color:#6b6560;line-height:1.7;">
      <strong style="color:#0e0e14;">💡 This week's tip:</strong> If you have assignments due Monday, block study time on Friday or Saturday — don't leave it to Sunday night. ProPlan Scholar has already scheduled sessions for you.
    </div>
  </div>
  <div class="footer">
    <p>Sent by ProPlan Scholar · <a href="${APP_URL}/app">Open App</a> · <a href="${unsubUrl}">Unsubscribe</a></p>
    <p>© 2026 ProPlan Scholar · proplanscholar.com</p>
    <p style="font-size:10px;color:rgba(240,236,227,.2);">AI-generated schedules are suggestions only — always verify deadlines with your official course materials.</p>
  </div>
</div>
</body>
</html>`;
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!RESEND_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }
  const results = { sent:0, skipped:0, errors:[] };
  try {
    const profiles = await supaFetch('profiles', {
      select: 'id,full_name,university,university_name,email_digest',
      email_digest: 'neq.false',
    });
    for (const profile of profiles) {
      try {
        const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile.id}`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!authRes.ok) { results.skipped++; continue; }
        const authUser = await authRes.json();
        const email = authUser.email;
        if (!email) { results.skipped++; continue; }
        const [courses, assignments, milestones] = await Promise.all([
          supaFetch('courses',     { user_id:`eq.${profile.id}`, select:'*' }),
          supaFetch('assignments', { user_id:`eq.${profile.id}`, select:'*', done:'eq.false' }),
          supaFetch('milestones',  { user_id:`eq.${profile.id}`, select:'*', done:'eq.false' }),
        ]);
        if (!courses?.length && !assignments?.length) { results.skipped++; continue; }
        const studyBlocks = getWeekStudyBlocks(assignments, courses);
        const unsubUrl = `${APP_URL}/api/digest/unsubscribe?uid=${profile.id}`;
        const html = buildEmailHTML({ profile, courses, assignments, milestones, studyBlocks, unsubUrl });
        const firstName = profile.full_name?.split(' ')[0] || 'Student';
        const deadlineCount = (assignments||[]).filter(a => { const d=daysUntil(a.due_date); return d>=0&&d<=7; }).length;
        const subject = deadlineCount > 0
          ? `📚 Your week ahead — ${deadlineCount} deadline${deadlineCount>1?'s':''} coming up`
          : `📚 ${firstName}'s ProPlan Scholar digest — week of ${formatDate(new Date().toISOString().slice(0,10))}`;
        await sendEmail({ to:email, subject, html });
        results.sent++;
        await new Promise(r => setTimeout(r, 100));
      } catch(userErr) {
        results.errors.push({ uid:profile.id, error:userErr.message });
      }
    }
    return res.status(200).json({ success:true, ...results });
  } catch(err) {
    return res.status(500).json({ error:err.message, ...results });
  }
}
