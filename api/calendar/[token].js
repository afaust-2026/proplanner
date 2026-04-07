// api/calendar/[token].js
// Vercel serverless function — serves a live .ics calendar feed
// URL: academicplan.pro/api/calendar/<token>
// Students subscribe to this URL once in their calendar app.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service key — has full read access, never exposed to browser
);

// ── ICS helpers ───────────────────────────────────────────────────────────────

function icsDate(dateStr) {
  // Convert YYYY-MM-DD to YYYYMMDD (all-day format)
  return dateStr.replace(/-/g, '');
}

function icsDateTime(dateStr, timeStr) {
  // Convert YYYY-MM-DD + HH:MM to YYYYMMDDTHHMMSS (local time, no Z)
  if (!timeStr) return icsDate(dateStr);
  const [h, m] = timeStr.split(':');
  return `${dateStr.replace(/-/g, '')}T${h.padStart(2,'0')}${m.padStart(2,'0')}00`;
}

function icsDateTimeUTC(dateStr, timeStr) {
  return icsDateTime(dateStr, timeStr) + 'Z';
}

function escapeICS(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function uid(prefix, id, date) {
  return `${prefix}-${id}-${date}@academicplan.pro`;
}

// Wrap long ICS lines at 75 chars (RFC 5545 requirement)
function foldLine(line) {
  if (line.length <= 75) return line;
  let result = '';
  let i = 0;
  while (i < line.length) {
    if (i === 0) {
      result += line.slice(0, 75);
      i = 75;
    } else {
      result += '\r\n ' + line.slice(i, i + 74);
      i += 74;
    }
  }
  return result;
}

function buildICS(events) {
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProPlan Scholar//academicplan.pro//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:ProPlan Scholar',
    'X-WR-TIMEZONE:America/Chicago',
    'X-WR-CALDESC:Your ProPlan Scholar schedule — classes, study sessions, and assignment deadlines.',
    ...events.flatMap(e => e),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n');
}

// ── Course class sessions (recurring weekly) ─────────────────────────────────
function classEvents(course) {
  if (!course.class_days?.length || !course.class_time) return [];
  
  const dayMap = { Sun: 'SU', Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR', Sat: 'SA' };
  const byDay = course.class_days.map(d => dayMap[d] || d).join(',');
  
  // Find the next occurrence of the first class day to use as DTSTART
  // Use semester start (today or course created_at) as anchor
  const today = new Date();
  const dayNums = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
  const firstDay = dayMap[course.class_days[0]];
  let start = new Date(today);
  while (start.getDay() !== (dayNums[firstDay] ?? 0)) {
    start.setDate(start.getDate() + 1);
  }
  const startDate = start.toISOString().slice(0, 10);
  
  // End time — default 90 min after start if not set
  const [sh, sm] = course.class_time.split(':').map(Number);
  let eh, em;
  if (course.class_end_time) {
    [eh, em] = course.class_end_time.split(':').map(Number);
  } else {
    eh = sh + 1; em = sm + 30;
    if (em >= 60) { eh += 1; em -= 60; }
  }
  const endTime = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;

  // Recur until end of year
  const untilYear = new Date().getFullYear();
  const until = `${untilYear}1231T235959Z`;

  return [
    'BEGIN:VEVENT',
    `UID:${uid('class', course.id, startDate)}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)}Z`,
    `DTSTART;TZID=America/Chicago:${icsDateTime(startDate, course.class_time)}`,
    `DTEND;TZID=America/Chicago:${icsDateTime(startDate, endTime)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${until}`,
    `SUMMARY:🎓 ${escapeICS(course.name)}`,
    `DESCRIPTION:${escapeICS(course.professor ? `Professor: ${course.professor}` : course.name)}`,
    `COLOR:${course.color || '#10b981'}`,
    'CATEGORIES:CLASS',
    'END:VEVENT',
  ];
}

// ── Assignment due dates ──────────────────────────────────────────────────────
function assignmentEvent(assignment, course) {
  if (!assignment.due_date) return [];
  return [
    'BEGIN:VEVENT',
    `UID:${uid('due', assignment.id, assignment.due_date)}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)}Z`,
    `DTSTART;VALUE=DATE:${icsDate(assignment.due_date)}`,
    `DTEND;VALUE=DATE:${icsDate(assignment.due_date)}`,
    `SUMMARY:📌 ${escapeICS(assignment.title)} DUE`,
    `DESCRIPTION:Course: ${escapeICS(course?.name || '')}\\nType: ${escapeICS(assignment.type || '')}\\nEst. hours: ${assignment.est_hours || 2}`,
    'CATEGORIES:ASSIGNMENT',
    assignment.done ? 'STATUS:COMPLETED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
  ];
}

// ── Study blocks (calculated from assignments like the app does) ──────────────
function studyEvent(assignment, course, dateStr, startTime, endTime) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid('study', assignment.id, dateStr)}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)}Z`,
    `DTSTART;TZID=America/Chicago:${icsDateTime(dateStr, startTime)}`,
    `DTEND;TZID=America/Chicago:${icsDateTime(dateStr, endTime)}`,
    `SUMMARY:📚 Study: ${escapeICS(assignment.title)}`,
    `DESCRIPTION:Course: ${escapeICS(course?.name || '')}\\nTopics: ${escapeICS(assignment.topics || 'See assignment notes')}`,
    `COLOR:${course?.color || '#0ea5e9'}`,
    'CATEGORIES:STUDY',
    'END:VEVENT',
  ];
}

// ── Milestone events ──────────────────────────────────────────────────────────
function milestoneEvent(milestone) {
  if (!milestone.due_date) return [];
  return [
    'BEGIN:VEVENT',
    `UID:${uid('milestone', milestone.id, milestone.due_date)}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)}Z`,
    `DTSTART;VALUE=DATE:${icsDate(milestone.due_date)}`,
    `DTEND;VALUE=DATE:${icsDate(milestone.due_date)}`,
    `SUMMARY:⬟ ${escapeICS(milestone.title)}`,
    `DESCRIPTION:${escapeICS(milestone.notes || '')}`,
    'CATEGORIES:MILESTONE',
    milestone.done ? 'STATUS:COMPLETED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
  ];
}

// ── Travel / blackout dates ───────────────────────────────────────────────────
function travelEvent(travel) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid('travel', travel.id, travel.start_date)}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)}Z`,
    `DTSTART;VALUE=DATE:${icsDate(travel.start_date)}`,
    `DTEND;VALUE=DATE:${icsDate(travel.end_date)}`,
    `SUMMARY:✈️ ${escapeICS(travel.label || 'Travel / Blackout')}`,
    'CATEGORIES:TRAVEL',
    'TRANSP:OPAQUE',
    'END:VEVENT',
  ];
}

// ── Simple study scheduler (mirrors the app logic) ───────────────────────────
function generateStudyBlocks(assignments, courses, travelDates) {
  const blocks = [];
  const dailyCount = {};
  const dailyNextStart = {};

  const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function isTravel(dateStr) {
    return travelDates.some(tr => dateStr >= tr.start_date && dateStr <= tr.end_date);
  }

  function daysUntil(due) {
    const n = new Date(); n.setHours(0,0,0,0);
    return Math.ceil((new Date(due + 'T00:00:00') - n) / 86400000);
  }

  const pending = assignments
    .filter(a => !a.done && daysUntil(a.due_date) >= 0)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  pending.forEach(assign => {
    const course = courses.find(c => c.id === assign.course_id);
    const diff = course?.difficulty || 3;
    const sessions = Math.ceil((assign.est_hours || 2) * (diff / 3) / 2);
    let placed = 0;
    let checkDay = new Date(); checkDay.setHours(0,0,0,0);
    const dueDay = new Date(assign.due_date + 'T00:00:00');

    while (placed < sessions && checkDay < dueDay) {
      const dateStr = checkDay.toISOString().slice(0, 10);
      const dayName = DAYS_SHORT[checkDay.getDay()];
      const alreadyOnDay = dailyCount[dateStr] || 0;

      if (!isTravel(dateStr) && alreadyOnDay < 2) {
        const baseStartH = 18; // default evening
        const startH = Math.max(baseStartH, dailyNextStart[dateStr] || baseStartH);
        const endH = startH + 2;

        if (endH <= 22) {
          const startTime = `${String(startH).padStart(2,'0')}:00`;
          const endTime = `${String(endH).padStart(2,'0')}:00`;
          blocks.push({ assign, course, dateStr, startTime, endTime });
          dailyNextStart[dateStr] = endH;
          dailyCount[dateStr] = (dailyCount[dateStr] || 0) + 1;
          placed++;
        }
      }
      checkDay.setDate(checkDay.getDate() + 1);
    }
  });

  return blocks;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send('Missing calendar token');
  }

  try {
    // Look up the token to get the user_id
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('calendar_tokens')
      .select('user_id')
      .eq('token', token)
      .single();

    if (tokenErr || !tokenRow) {
      return res.status(404).send('Calendar not found. Please regenerate your calendar link in ProPlan Scholar.');
    }

    const userId = tokenRow.user_id;

    // Fetch all user data in parallel
    const [
      { data: courses },
      { data: assignments },
      { data: milestones },
      { data: travelDates },
      { data: profile },
    ] = await Promise.all([
      supabase.from('courses').select('*').eq('user_id', userId),
      supabase.from('assignments').select('*').eq('user_id', userId),
      supabase.from('milestones').select('*').eq('user_id', userId),
      supabase.from('travel_dates').select('*').eq('user_id', userId),
      supabase.from('profiles').select('full_name').eq('id', userId).single(),
    ]);

    // Build study blocks
    const studyBlocks = generateStudyBlocks(
      assignments || [],
      courses || [],
      travelDates || []
    );

    // Build all events
    const events = [
      // Class sessions (recurring)
      ...(courses || []).flatMap(c => classEvents(c)),
      // Assignment due dates
      ...(assignments || []).flatMap(a => {
        const course = (courses || []).find(c => c.id === a.course_id);
        return assignmentEvent(a, course);
      }),
      // Study blocks
      ...studyBlocks.map(b => studyEvent(b.assign, b.course, b.dateStr, b.startTime, b.endTime)),
      // Milestones
      ...(milestones || []).flatMap(m => milestoneEvent(m)),
      // Travel / blackout dates
      ...(travelDates || []).flatMap(t => travelEvent(t)),
    ];

    const ics = buildICS(events);
    const name = profile?.full_name || 'Student';

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="proplan-scholar-${name.replace(/\s+/g,'-').toLowerCase()}.ics"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(ics);

  } catch (err) {
    console.error('Calendar feed error:', err);
    res.status(500).send('Error generating calendar feed');
  }
}
