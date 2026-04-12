// api/calendar/[token].js
// Vercel serverless function — live .ics calendar feed
// URL: academicplan.pro/api/calendar/<token>

// Use node-fetch style https for Supabase REST calls
// (avoids npm dependency issues in Vercel serverless)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// ── Simple Supabase REST client (no npm package needed) ──────────────────────
async function supaFetch(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── ICS helpers ───────────────────────────────────────────────────────────────
function icsDate(d) { return d ? d.replace(/-/g, '') : ''; }

function icsDateTime(dateStr, timeStr) {
  if (!dateStr) return '';
  if (!timeStr) return icsDate(dateStr);
  const [h, m] = timeStr.split(':');
  return `${dateStr.replace(/-/g,'')}T${String(h).padStart(2,'0')}${String(m).padStart(2,'0')}00`;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n').replace(/\r/g,'');
}

function uid(type, id, date) { return `${type}-${id}-${date}@academicplan.pro`; }

function foldLine(line) {
  if (line.length <= 75) return line;
  let out = '', i = 0;
  while (i < line.length) {
    if (i === 0) { out += line.slice(0, 75); i = 75; }
    else { out += '\r\n ' + line.slice(i, i + 74); i += 74; }
  }
  return out;
}

function stamp() {
  return new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)+'Z';
}

// ── Event builders ────────────────────────────────────────────────────────────
function classEvent(course) {
  if (!course.class_days?.length) return [];
  const dayMap = {Sun:'SU',Mon:'MO',Tue:'TU',Wed:'WE',Thu:'TH',Fri:'FR',Sat:'SA'};
  const byDay = course.class_days.map(d => dayMap[d] || d).join(',');
  if (!byDay) return [];

  // Find next occurrence of first class day
  const dNums = {SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};
  const first = dayMap[course.class_days[0]];
  let d = new Date(); d.setHours(0,0,0,0);
  const target = dNums[first] ?? 0;
  while (d.getDay() !== target) d.setDate(d.getDate()+1);
  const startDate = d.toISOString().slice(0,10);

  const startT = course.class_time || '09:00';
  let endT = course.class_end_time;
  if (!endT) {
    const [sh,sm] = startT.split(':').map(Number);
    let eh = sh+1, em = sm+30;
    if (em >= 60) { eh++; em -= 60; }
    endT = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
  }
  const until = `${new Date().getFullYear()}1231T235959Z`;

  return ['BEGIN:VEVENT',
    `UID:${uid('class',course.id,startDate)}`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;TZID=America/Chicago:${icsDateTime(startDate,startT)}`,
    `DTEND;TZID=America/Chicago:${icsDateTime(startDate,endT)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${until}`,
    `SUMMARY:🎓 ${esc(course.name)}`,
    course.professor ? `DESCRIPTION:Professor: ${esc(course.professor)}` : `DESCRIPTION:${esc(course.name)}`,
    'CATEGORIES:CLASS',
    'END:VEVENT'];
}

function assignmentEvent(a, course) {
  if (!a.due_date) return [];
  return ['BEGIN:VEVENT',
    `UID:${uid('due',a.id,a.due_date)}`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;VALUE=DATE:${icsDate(a.due_date)}`,
    `DTEND;VALUE=DATE:${icsDate(a.due_date)}`,
    `SUMMARY:📌 ${esc(a.title)} — DUE`,
    `DESCRIPTION:Course: ${esc(course?.name||'')}\\nType: ${esc(a.type||'')}\\nEstimated hours: ${a.est_hours||2}`,
    'CATEGORIES:ASSIGNMENT',
    a.done ? 'STATUS:COMPLETED' : 'STATUS:CONFIRMED',
    'END:VEVENT'];
}

function studyEvent(a, course, dateStr, startTime, endTime) {
  return ['BEGIN:VEVENT',
    `UID:${uid('study',a.id,dateStr)}`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;TZID=America/Chicago:${icsDateTime(dateStr,startTime)}`,
    `DTEND;TZID=America/Chicago:${icsDateTime(dateStr,endTime)}`,
    `SUMMARY:📚 Study: ${esc(a.title)}`,
    `DESCRIPTION:Course: ${esc(course?.name||'')}\\nTopics: ${esc(a.topics||'')}`,
    'CATEGORIES:STUDY',
    'END:VEVENT'];
}

function milestoneEvent(m) {
  if (!m.due_date) return [];
  return ['BEGIN:VEVENT',
    `UID:${uid('ms',m.id,m.due_date)}`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;VALUE=DATE:${icsDate(m.due_date)}`,
    `DTEND;VALUE=DATE:${icsDate(m.due_date)}`,
    `SUMMARY:⬟ ${esc(m.title)}`,
    m.notes ? `DESCRIPTION:${esc(m.notes)}` : '',
    'CATEGORIES:MILESTONE',
    m.done ? 'STATUS:COMPLETED' : 'STATUS:CONFIRMED',
    'END:VEVENT'].filter(Boolean);
}

function travelEvent(tr) {
  const start = tr.start_date || tr.start;
  const end = tr.end_date || tr.end;
  if (!start) return [];
  return ['BEGIN:VEVENT',
    `UID:${uid('travel',tr.id,start)}`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;VALUE=DATE:${icsDate(start)}`,
    `DTEND;VALUE=DATE:${icsDate(end||start)}`,
    `SUMMARY:✈️ ${esc(tr.label||'Blackout')}`,
    'CATEGORIES:TRAVEL',
    'TRANSP:OPAQUE',
    'END:VEVENT'];
}

// ── Study scheduler (mirrors app logic) ──────────────────────────────────────
function buildStudyBlocks(assignments, courses, travelDates) {
  const blocks = [];
  const dailyCount = {};
  const dailyNext = {};
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const isTravel = (d) => travelDates.some(tr => {
    const s = tr.start_date||tr.start||''; const e = tr.end_date||tr.end||'';
    return d >= s && d <= e;
  });

  const daysUntil = (due) => {
    const n = new Date(); n.setHours(0,0,0,0);
    return Math.ceil((new Date(due+'T00:00:00')-n)/86400000);
  };

  const pending = (assignments||[])
    .filter(a => !a.done && a.due_date && daysUntil(a.due_date) >= 0)
    .sort((a,b) => new Date(a.due_date)-new Date(b.due_date));

  for (const a of pending) {
    const course = (courses||[]).find(c => c.id === a.course_id);
    const diff = course?.difficulty || 3;
    const sessions = Math.ceil((a.est_hours||2)*(diff/3)/2);
    let placed = 0;
    let day = new Date(); day.setHours(0,0,0,0);
    const due = new Date(a.due_date+'T00:00:00');

    while (placed < sessions && day < due) {
      const ds = day.toISOString().slice(0,10);
      if (!isTravel(ds) && (dailyCount[ds]||0) < 2) {
        const base = 18;
        const startH = Math.max(base, dailyNext[ds]||base);
        const endH = startH + 2;
        if (endH <= 22) {
          const st = `${String(startH).padStart(2,'0')}:00`;
          const et = `${String(endH).padStart(2,'0')}:00`;
          blocks.push({a, course, ds, st, et});
          dailyNext[ds] = endH;
          dailyCount[ds] = (dailyCount[ds]||0)+1;
          placed++;
        }
      }
      day.setDate(day.getDate()+1);
    }
  }
  return blocks;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { token } = req.query;

  // Config check
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).send([
      'BEGIN:VCALENDAR','VERSION:2.0',
      'PRODID:-//ProPlan Scholar//Error//EN',
      'X-WR-CALNAME:ProPlan Scholar — Setup Required',
      'BEGIN:VEVENT',`UID:error-config@academicplan.pro`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;VALUE=DATE:${icsDate(new Date().toISOString().slice(0,10))}`,
      `DTEND;VALUE=DATE:${icsDate(new Date().toISOString().slice(0,10))}`,
      'SUMMARY:⚠️ Calendar setup incomplete — check Vercel env vars',
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n'));
  }

  if (!token) return res.status(400).send('Missing token');

  try {
    // Look up token → user_id
    const tokens = await supaFetch('calendar_tokens', {
      token: `eq.${token}`,
      select: 'user_id',
      limit: '1',
    });

    if (!tokens?.length) {
      return res.status(404).send(
        'Calendar not found. Please regenerate your calendar link in ProPlan Scholar Settings.'
      );
    }

    const userId = tokens[0].user_id;

    // Fetch all data in parallel
    const [courses, assignments, milestones, travels, profiles] = await Promise.all([
      supaFetch('courses',        { user_id: `eq.${userId}`, select: '*' }),
      supaFetch('assignments',    { user_id: `eq.${userId}`, select: '*' }),
      supaFetch('milestones',     { user_id: `eq.${userId}`, select: '*' }),
      supaFetch('travel_dates',   { user_id: `eq.${userId}`, select: '*' }),
      supaFetch('profiles',       { id: `eq.${userId}`, select: 'full_name', limit: '1' }),
    ]);

    const name = (profiles?.[0]?.full_name || 'Student').replace(/\s+/g,'-').toLowerCase();

    // Build events
    const studyBlocks = buildStudyBlocks(assignments, courses, travels);

    const allEvents = [
      ...(courses||[]).flatMap(c => classEvent(c)),
      ...(assignments||[]).flatMap(a => assignmentEvent(a, (courses||[]).find(c=>c.id===a.course_id))),
      ...studyBlocks.map(b => studyEvent(b.a, b.course, b.ds, b.st, b.et)),
      ...(milestones||[]).flatMap(m => milestoneEvent(m)),
      ...(travels||[]).flatMap(t => travelEvent(t)),
    ];

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ProPlan Scholar//academicplan.pro//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:ProPlan Scholar',
      'X-WR-TIMEZONE:America/Chicago',
      'X-WR-CALDESC:Your ProPlan Scholar schedule — classes\\, study sessions\\, and deadlines.',
      ...allEvents,
      'END:VCALENDAR',
    ].map(foldLine).join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="proplan-${name}.ics"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(icsLines);

  } catch (err) {
    console.error('Calendar error:', err.message);
    // Return a valid but empty calendar instead of crashing
    const errICS = [
      'BEGIN:VCALENDAR','VERSION:2.0',
      'PRODID:-//ProPlan Scholar//Error//EN',
      'X-WR-CALNAME:ProPlan Scholar',
      'BEGIN:VEVENT',
      `UID:error-${Date.now()}@academicplan.pro`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;VALUE=DATE:${icsDate(new Date().toISOString().slice(0,10))}`,
      `DTEND;VALUE=DATE:${icsDate(new Date().toISOString().slice(0,10))}`,
      `SUMMARY:⚠️ Calendar sync error — please regenerate your link`,
      `DESCRIPTION:Error: ${esc(err.message)}`,
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    return res.status(200).send(errICS);
  }
}
