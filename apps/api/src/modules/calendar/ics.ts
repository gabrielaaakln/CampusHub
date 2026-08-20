import type { CalendarItem } from '@campushub/shared';

const CRLF = '\r\n';
const DEADLINE_MINUTES = 30;

/** every moment leaves as utc so no VTIMEZONE block has to be shipped or trusted */
function stamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function esc(text: string): string {
  return text.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
}

/** rfc 5545 wants at most 75 octets per line with a space starting each continuation */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (parts.length === 0 ? 75 : 74), bytes.length);
    // never cut inside a multi byte character
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return parts.join(`${CRLF} `);
}

function describe(item: CalendarItem): string | null {
  const parts = [
    item.type,
    item.professor,
    item.group ? `grupa ${item.group}` : null,
    item.kind === 'deadline' ? 'termen' : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function place(item: CalendarItem): string | null {
  if (item.room?.number) {
    return item.room.building ? `${item.room.number}, ${item.room.building}` : item.room.number;
  }
  return item.location ?? null;
}

export function toIcs(items: CalendarItem[], calendarName: string): string {
  const now = stamp(new Date().toISOString());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CampusHub//RO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calendarName)}`,
  ];

  for (const item of items) {
    const ends =
      item.endsAt ??
      new Date(Date.parse(item.startsAt) + DEADLINE_MINUTES * 60_000).toISOString();
    const description = describe(item);
    const location = place(item);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.id}@campushub`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(item.startsAt)}`,
      `DTEND:${stamp(ends)}`,
      `SUMMARY:${esc(item.title)}`,
      ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
      ...(location ? [`LOCATION:${esc(location)}`] : []),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}
