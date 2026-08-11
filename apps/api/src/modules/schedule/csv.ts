import { rawEntry, type RawEntry } from '@campushub/shared';

const COLUMNS = [
  'group',
  'subgroup',
  'day',
  'start',
  'end',
  'type',
  'parity',
  'subject',
  'room',
  'professor',
  'starts_week',
  'ends_week',
] as const;

const OPTIONAL: (typeof COLUMNS)[number][] = ['room', 'professor', 'starts_week', 'ends_week'];

export type CsvParseResult = {
  entries: RawEntry[];
  errors: { line: number; message: string }[];
};

/** minimal rfc4180 reader enough for a file exported from a spreadsheet */
export function parseCsv(input: string): string[][] {
  // excel writes a bom and it would end up glued to the first column name
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') endField();
    else if (c === '\n') endRow();
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

// bad rows are reported not dropped a source that half breaks must be visible
export function parseScheduleCsv(text: string): CsvParseResult {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header) return { entries: [], errors: [{ line: 0, message: 'Fișier gol' }] };

  const index = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const missing = COLUMNS.filter((c) => !OPTIONAL.includes(c) && !index.has(c));
  if (missing.length > 0) {
    return { entries: [], errors: [{ line: 1, message: `Lipsesc coloanele: ${missing.join(', ')}` }] };
  }

  const cell = (row: string[], name: (typeof COLUMNS)[number]): string => {
    const i = index.get(name);
    return i === undefined ? '' : (row[i] ?? '').trim();
  };

  const entries: RawEntry[] = [];
  const errors: CsvParseResult['errors'] = [];

  rows.forEach((row, i) => {
    const line = i + 2;
    const parsed = rawEntry.safeParse({
      groupName: cell(row, 'group'),
      subgroup: cell(row, 'subgroup') || '0',
      day: cell(row, 'day').toLowerCase(),
      startTime: cell(row, 'start'),
      endTime: cell(row, 'end'),
      classType: cell(row, 'type').toLowerCase(),
      parity: cell(row, 'parity').toLowerCase() || 'ambele',
      subject: cell(row, 'subject'),
      room: cell(row, 'room') || undefined,
      professor: cell(row, 'professor') || undefined,
      startsWeek: cell(row, 'starts_week') || undefined,
      endsWeek: cell(row, 'ends_week') || undefined,
    });
    if (parsed.success) entries.push(parsed.data);
    else {
      const first = parsed.error.issues[0];
      errors.push({ line, message: `${first?.path.join('.') ?? '?'}: ${first?.message ?? 'invalid'}` });
    }
  });

  return { entries, errors };
}
