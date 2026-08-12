import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { rawEntry, type RawEntry } from '@campushub/shared';
import type { ParseResult, RawSource, ScheduleAdapter } from '../types.js';

// the workbook documents its own grammar in a legend cell
//   acronim-disciplina tip-activitate periodicitate acronime-profesori sali extra-info
// courses spell the subject out and put the acronym in parentheses
//   Matematici aplicate in inginerie (MAI) C s prof.dr.ing. D. Fetcu AC0-1

const ROOM_SHEET = 'Sali';
const PROFESSOR_SHEET = 'Profesori';
const GROUP_SHEET = /^(L-|M-)/;

const CLASS_TYPE: Record<string, RawEntry['classType']> = {
  C: 'curs',
  S: 'seminar',
  L: 'laborator',
  P: 'proiect',
};

const PARITY: Record<string, RawEntry['parity']> = {
  s: 'ambele',
  i: 'impar',
  p: 'par',
};

const DAYS: Record<string, RawEntry['day']> = {
  luni: 'luni',
  marti: 'marti',
  miercuri: 'miercuri',
  joi: 'joi',
  vineri: 'vineri',
  sambata: 'sambata',
  duminica: 'duminica',
};

export type Dictionaries = {
  /** room id to the location text the faculty already writes for students */
  rooms: Map<string, string>;
  /** professor acronym to full name */
  professors: Map<string, string>;
  /** subject acronym to full name, collected from the course cells */
  subjects: Map<string, string>;
};

export class XlsxAdapter implements ScheduleAdapter {
  readonly name = 'xlsx';

  private constructor(private readonly source: RawSource) {}

  static fromBuffer(buffer: Buffer, filename?: string): XlsxAdapter {
    return new XlsxAdapter({
      buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...(filename ? { filename } : {}),
    });
  }

  static async fromFile(path: string): Promise<XlsxAdapter> {
    return new XlsxAdapter({
      buffer: await readFile(path),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: path,
    });
  }

  fetch(): Promise<RawSource> {
    return Promise.resolve(this.source);
  }

  async parse(src: RawSource): Promise<ParseResult> {
    const { entries, errors } = await parseWorkbook(src.buffer);
    return { entries, errors };
  }
}

export async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

/** exceljs throws on some merged cells so every read goes through here */
function text(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return '';
  try {
    return (cell.text ?? '').trim();
  } catch {
    return '';
  }
}

export function readDictionaries(wb: ExcelJS.Workbook): Omit<Dictionaries, 'subjects'> {
  const rooms = new Map<string, string>();
  const professors = new Map<string, string>();

  const roomSheet = wb.getWorksheet(ROOM_SHEET);
  if (roomSheet) {
    for (let c = 3; c <= roomSheet.columnCount; c++) {
      const id = text(roomSheet.getRow(2).getCell(c));
      if (id) rooms.set(id, text(roomSheet.getRow(1).getCell(c)).replace(/\s+/g, ' '));
    }
  }

  const professorSheet = wb.getWorksheet(PROFESSOR_SHEET);
  if (professorSheet) {
    for (let c = 3; c <= professorSheet.columnCount; c++) {
      const id = text(professorSheet.getRow(2).getCell(c));
      const name = text(professorSheet.getRow(1).getCell(c)).replace(/\s+/g, ' ');
      if (id && name) professors.set(id, name);
    }
  }

  return { rooms, professors };
}

/** the Zi/Ora header is not always on the same row so it is searched for */
function findHeaderRow(ws: ExcelJS.Worksheet): number | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
    const first = text(ws.getRow(r).getCell(1)).toLowerCase();
    const second = text(ws.getRow(r).getCell(2)).toLowerCase();
    if (first === 'zi' && second.startsWith('ora')) return r;
  }
  return null;
}

type ColumnTarget = { groupName: string; subgroup: number };

/** 1101A is group 1101 subgroup 1, a header without a letter is the whole group */
function parseColumns(ws: ExcelJS.Worksheet, headerRow: number): Map<number, ColumnTarget> {
  const columns = new Map<number, ColumnTarget>();
  for (let c = 3; c <= ws.columnCount; c++) {
    const header = text(ws.getRow(headerRow).getCell(c)).replace(/\s+/g, '');
    if (!header || header.length > 20 || /\s/.test(header)) continue;

    const split = /^(.*\d)([A-D])$/.exec(header);
    if (split) {
      columns.set(c, {
        groupName: split[1]!,
        subgroup: split[2]!.charCodeAt(0) - 'A'.charCodeAt(0) + 1,
      });
    } else if (/\d/.test(header)) {
      columns.set(c, { groupName: header, subgroup: 0 });
    }
  }
  return columns;
}

export type Activity = {
  code: string;
  subject: string;
  classType: RawEntry['classType'];
  parity: RawEntry['parity'];
  startsWeek: number | null;
  endsWeek: number | null;
  professors: string[];
  rooms: string[];
  note: string | null;
};

const PERIOD_ATOM = '[sip]([<>]=?\\d+)?';
const PERIOD_TOKEN = new RegExp(`^${PERIOD_ATOM}(\\|${PERIOD_ATOM})*$`);

type Period = {
  parity: RawEntry['parity'];
  startsWeek: number | null;
  endsWeek: number | null;
};

/**
 * s>7 means from week 8 onwards and s<8 means up to week 7
 * a list like s<8|s>7 is one class whose teacher changes mid semester so the
 * bounds cover the whole term together and nothing is stored
 */
export function readPeriod(token: string): Period {
  const atoms = token.split('|').filter(Boolean);
  const letters = new Set(atoms.map((a) => a[0]!));
  const parity = letters.size === 1 ? (PARITY[[...letters][0]!] ?? 'ambele') : 'ambele';

  const bounds = atoms.map((atom) => {
    const range = /^[sip]([<>])(=?)(\d+)$/.exec(atom);
    if (!range) return { from: null, to: null };
    const week = Number(range[3]);
    return range[1] === '>'
      ? { from: range[2] ? week : week + 1, to: null }
      : { from: null, to: range[2] ? week : week - 1 };
  });

  // one open side anywhere in the list leaves that side open for the class
  const open = (side: 'from' | 'to') => bounds.some((b) => b[side] === null);
  return {
    parity,
    startsWeek: open('from') ? null : Math.min(...bounds.map((b) => b.from!)),
    endsWeek: open('to') ? null : Math.max(...bounds.map((b) => b.to!)),
  };
}

/**
 * cell text is wrapped over several lines so newlines are not separators
 * one interval can hold several activities and the pair type periodicity anchors each one
 */
export function parseActivities(cell: string, dicts: Dictionaries): Activity[] {
  const tokens = cell.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  const anchors: number[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (CLASS_TYPE[tokens[i]!] && PERIOD_TOKEN.test(tokens[i + 1]!)) anchors.push(i);
  }
  if (anchors.length === 0) return [];

  const activities: Activity[] = [];
  let subjectStart = 0;

  for (const [index, anchor] of anchors.entries()) {
    const next = anchors[index + 1];
    const tailEnd = next === undefined ? tokens.length : next;
    const tail = tokens.slice(anchor + 2, tailEnd);

    // the last room of this activity is the last token before the next subject
    let split = tail.length;
    if (next !== undefined) {
      const lastRoom = tail.map((t) => dicts.rooms.has(t)).lastIndexOf(true);
      split = lastRoom >= 0 ? lastRoom + 1 : tail.length;
    }

    const activity = build(
      tokens.slice(subjectStart, anchor),
      tokens[anchor]!,
      tokens[anchor + 1]!,
      tail.slice(0, split),
      dicts,
    );
    if (activity) activities.push(activity);
    subjectStart = anchor + 2 + split;
  }

  return activities;
}

function build(
  subjectTokens: string[],
  typeToken: string,
  periodToken: string,
  tail: string[],
  dicts: Dictionaries,
): Activity | null {
  const classType = CLASS_TYPE[typeToken];
  if (!classType) return null;

  const head = subjectTokens.join(' ').trim();
  const named = /^(.+?)\s*\(([^)]+)\)$/.exec(head);
  const code = named ? named[2]!.trim() : head;
  let subject = named ? named[1]!.trim() : '';

  const period = readPeriod(periodToken);

  const rooms = tail.filter((t) => dicts.rooms.has(t));
  const others = tail.filter((t) => !dicts.rooms.has(t));

  const professors: string[] = [];
  const extras: string[] = [];
  for (const token of others) {
    // BN|AA is two teachers of the same class
    const parts = token.split('|').filter(Boolean);
    const known = parts.map((p) => dicts.professors.get(p));
    if (parts.length > 0 && known.every((n) => n !== undefined)) professors.push(...known);
    else extras.push(token);
  }
  // a course spells the teacher out instead of using an acronym
  if (professors.length === 0 && extras.length > 0) {
    professors.push(extras.join(' ').replace(/\s*\|\s*/g, ', '));
    extras.length = 0;
  }

  if (!subject) subject = dicts.subjects.get(code) ?? code;
  if (!subject) return null;

  return {
    code,
    subject,
    classType,
    parity: period.parity,
    startsWeek: period.startsWeek,
    endsWeek: period.endsWeek,
    professors,
    rooms,
    note: extras.join(' ') || null,
  };
}

/** first pass over the course cells builds acronym to full subject name */
export function collectSubjectNames(wb: ExcelJS.Workbook): Map<string, string> {
  const names = new Map<string, string>();
  const pattern = /([^()]+?)\s*\(([^)\s]+)\)\s+[CSLP]\s+[sip]/g;
  for (const ws of wb.worksheets) {
    if (!GROUP_SHEET.test(ws.name)) continue;
    for (let r = 1; r <= ws.rowCount; r++) {
      for (let c = 3; c <= ws.columnCount; c++) {
        const cell = text(ws.getRow(r).getCell(c)).replace(/\s+/g, ' ');
        for (const match of cell.matchAll(pattern)) {
          const name = match[1]!.trim();
          const code = match[2]!.trim();
          if (name && code && !names.has(code)) names.set(code, name);
        }
      }
    }
  }
  return names;
}

export function dictionariesOf(wb: ExcelJS.Workbook): Dictionaries {
  return { ...readDictionaries(wb), subjects: collectSubjectNames(wb) };
}

export async function parseWorkbook(buffer: Buffer): Promise<ParseResult> {
  const wb = await loadWorkbook(buffer);
  return extractEntries(wb, dictionariesOf(wb));
}

export function extractEntries(wb: ExcelJS.Workbook, dicts: Dictionaries): ParseResult {
  const entries: RawEntry[] = [];
  const errors: ParseResult['errors'] = [];

  for (const ws of wb.worksheets) {
    if (!GROUP_SHEET.test(ws.name)) continue;

    const headerRow = findHeaderRow(ws);
    if (headerRow === null) {
      errors.push({ line: 0, message: `${ws.name}: nu am găsit antetul Zi/Ora` });
      continue;
    }

    const columns = parseColumns(ws, headerRow);
    if (columns.size === 0) {
      errors.push({ line: headerRow, message: `${ws.name}: nicio coloană de grupă` });
      continue;
    }

    for (const [col, target] of columns) {
      collectColumn(ws, headerRow, col, target, dicts, entries, errors);
    }
  }

  return { entries, errors };
}

type Slot = { day: RawEntry['day']; hour: number; cell: string };

function readSlots(ws: ExcelJS.Worksheet, headerRow: number, col: number): Slot[] {
  const slots: Slot[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const day = DAYS[normalizeDay(text(ws.getRow(r).getCell(1)))];
    const hour = Number(text(ws.getRow(r).getCell(2)));
    if (!day || !Number.isInteger(hour)) continue;
    slots.push({ day, hour, cell: text(ws.getRow(r).getCell(col)).replace(/\s+/g, ' ') });
  }
  return slots;
}

function normalizeDay(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function collectColumn(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  col: number,
  target: ColumnTarget,
  dicts: Dictionaries,
  entries: RawEntry[],
  errors: ParseResult['errors'],
): void {
  const slots = readSlots(ws, headerRow, col);

  // an activity occupies one row per hour so identical consecutive lines are one class
  const open = new Map<string, { activity: Activity; day: RawEntry['day']; start: number; end: number }>();

  const flush = (key: string) => {
    const run = open.get(key);
    if (!run) return;
    open.delete(key);
    const candidate = {
      groupName: target.groupName,
      subgroup: target.subgroup,
      day: run.day,
      startTime: `${String(run.start).padStart(2, '0')}:00`,
      endTime: `${String(run.end).padStart(2, '0')}:00`,
      classType: run.activity.classType,
      parity: run.activity.parity,
      startsWeek: run.activity.startsWeek ?? undefined,
      endsWeek: run.activity.endsWeek ?? undefined,
      subject: run.activity.subject.slice(0, 200),
      room: run.activity.rooms[0]?.slice(0, 50),
      professor: run.activity.professors.join(', ').slice(0, 150) || undefined,
    };
    const parsed = rawEntry.safeParse(candidate);
    if (parsed.success) entries.push(parsed.data);
    else {
      errors.push({
        line: 0,
        message: `${ws.name} ${target.groupName}: ${parsed.error.issues[0]?.message ?? 'rând invalid'}`,
      });
    }
  };

  for (const slot of slots) {
    const active = new Set<string>();
    for (const activity of parseActivities(slot.cell, dicts)) {
      const key = [
        slot.day,
        activity.code,
        activity.classType,
        activity.parity,
        activity.startsWeek,
        activity.endsWeek,
        activity.rooms.join(),
        activity.professors.join(),
      ].join('#');
      active.add(key);
      const run = open.get(key);
      if (run && run.end === slot.hour) run.end = slot.hour + 1;
      else {
        flush(key);
        open.set(key, { activity, day: slot.day, start: slot.hour, end: slot.hour + 1 });
      }
    }
    for (const key of [...open.keys()]) if (!active.has(key)) flush(key);
  }
  for (const key of [...open.keys()]) flush(key);
}
