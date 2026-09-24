// Test-drive windows ("Sat, Sep 27" + "9am-12pm", or "Saturday" + "10am-12pm")
// to concrete local times, and iCalendar (.ics) files for "Add to calendar".
// Times are wall-clock in the launch market's zone (America/Chicago).

export const MARKET_TZ = "America/Chicago";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export interface LocalDate { year: number; month: number; day: number }
export interface LocalWindow { date: LocalDate; startHour: number; startMinute: number; endHour: number; endMinute: number }

function parseClock(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if ((m[3] ?? "").toLowerCase() === "pm") h += 12;
  if (!m[3] && Number(m[1]) === 12) h = 12;
  return { h, m: Number(m[2] ?? 0) };
}

/** "9am-12pm" -> 9:00-12:00. A single time ("2pm") becomes a 1-hour window. */
export function parseTimeRange(s: string): { start: { h: number; m: number }; end: { h: number; m: number } } | null {
  const [a, b] = s.split(/\s*[-–]\s*/);
  let start = parseClock(a ?? "");
  const end = b ? parseClock(b) : null;
  if (!start) return null;
  // "10-12pm": carry the meridiem from the end.
  if (end && !/am|pm/i.test(a) && /pm/i.test(b ?? "") && start.h < 12 && start.h + 12 <= end.h) start = { ...start, h: start.h + 12 };
  return { start, end: end ?? { h: start.h + 1, m: start.m } };
}

function addDays(d: LocalDate, n: number): LocalDate {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/** Resolve "Sat, Sep 27", "Sep 27" or "Saturday" to the next matching date on/after today. */
export function resolveDay(label: string, today: LocalDate): LocalDate | null {
  const s = label.toLowerCase();
  const md = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/.exec(s);
  if (md) {
    const month = MONTHS.indexOf(md[1]) + 1;
    const day = Number(md[2]);
    let year = today.year;
    // A date more than ~6 months back means next year (e.g. "Jan 3" in December).
    if (month * 31 + day < today.month * 31 + today.day - 180) year += 1;
    return { year, month, day };
  }
  if (/today/.test(s)) return today;
  if (/tomorrow/.test(s)) return addDays(today, 1);
  const wd = WEEKDAYS.findIndex((w) => s.startsWith(w) || s.includes(` ${w}`));
  if (wd === -1) return null;
  const todayWd = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  return addDays(today, (wd - todayWd + 7) % 7);
}

export function resolveWindow(w: { day: string; time: string }, today: LocalDate): LocalWindow | null {
  const date = resolveDay(w.day, today);
  const t = parseTimeRange(w.time);
  if (!date || !t) return null;
  return { date, startHour: t.start.h, startMinute: t.start.m, endHour: t.end.h, endMinute: t.end.m };
}

/** Today's date in the market time zone. */
export function todayIn(tz = MARKET_TZ, now = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

const pad = (n: number) => String(n).padStart(2, "0");
const localStamp = (d: LocalDate, h: number, m: number) => `${d.year}${pad(d.month)}${pad(d.day)}T${pad(h)}${pad(m)}00`;
const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold lines longer than 75 octets (RFC 5545 3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export interface IcsEvent {
  uid: string;
  window: LocalWindow;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
}

/** A single-event iCalendar file in America/Chicago (US DST rules). */
export function buildIcs(e: IcsEvent, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CarSwipe//Test drives//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${MARKET_TZ}`,
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0600",
    "TZOFFSETTO:-0500",
    "TZNAME:CDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0600",
    "TZNAME:CST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${MARKET_TZ}:${localStamp(e.window.date, e.window.startHour, e.window.startMinute)}`,
    `DTEND;TZID=${MARKET_TZ}:${localStamp(e.window.date, e.window.endHour, e.window.endMinute)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Test drive in 1 hour",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
