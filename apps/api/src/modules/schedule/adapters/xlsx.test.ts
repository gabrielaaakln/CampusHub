import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { XlsxAdapter, parseActivities, type Dictionaries } from './xlsx.js';

const REAL = fileURLToPath(
  new URL('../../../../../../fixtures/schedule/real/orar-ac-2025-2026-sem2.xlsx', import.meta.url),
);

const dicts: Dictionaries = {
  rooms: new Map([
    ['AC0-1', 'Parter'],
    ['E407', 'Electrotehnică'],
    ['A0-10', 'DAIA'],
  ]),
  professors: new Map([
    ['BF', 'Brașoveanu Florian Alexandru'],
    ['POl', 'Plopa Olga'],
  ]),
  subjects: new Map([['DCE', 'Dispozitive și circuite electronice']]),
};

describe('parseActivities', () => {
  it('reads the short form used for seminars and labs', () => {
    const [a] = parseActivities('DCE L s BF A0-10', dicts);
    expect(a).toMatchObject({
      code: 'DCE',
      subject: 'Dispozitive și circuite electronice',
      classType: 'laborator',
      parity: 'ambele',
      rooms: ['A0-10'],
      professors: ['Brașoveanu Florian Alexandru'],
    });
  });

  it('reads the long form where a course spells the subject out', () => {
    const [a] = parseActivities(
      'Matematici aplicate în inginerie (MAI) C s lect.dr.mat. G. Grosu AC0-1',
      dicts,
    );
    expect(a?.subject).toBe('Matematici aplicate în inginerie');
    expect(a?.code).toBe('MAI');
    expect(a?.rooms).toEqual(['AC0-1']);
    expect(a?.professors).toEqual(['lect.dr.mat. G. Grosu']);
  });

  it('maps the periodicity letters to week parity', () => {
    expect(parseActivities('DCE S i POl E407', dicts)[0]?.parity).toBe('impar');
    expect(parseActivities('DCE S p POl E407', dicts)[0]?.parity).toBe('par');
    expect(parseActivities('DCE S s POl E407', dicts)[0]?.parity).toBe('ambele');
  });

  it('reads a week range that covers part of the semester', () => {
    const [a] = parseActivities('DCE L s>10 BF A0-10', dicts);
    expect(a?.parity).toBe('ambele');
    expect(a?.startsWeek).toBe(11);
    expect(a?.endsWeek).toBeNull();

    const [b] = parseActivities('DCE L s<8 BF A0-10', dicts);
    expect(b?.startsWeek).toBeNull();
    expect(b?.endsWeek).toBe(7);
  });

  it('keeps a class whose teacher changes mid semester as one entry', () => {
    const [a] = parseActivities('DCE C s<8|s>7 BF|POl A0-10', dicts);
    expect(a?.startsWeek).toBeNull();
    expect(a?.endsWeek).toBeNull();
    expect(a?.professors).toEqual(['Brașoveanu Florian Alexandru', 'Plopa Olga']);
    expect(a?.rooms).toEqual(['A0-10']);
  });

  it('joins the two halves when the teachers are spelled out', () => {
    const [a] = parseActivities('Dispozitive (DCE) C s<8|s>7 prof. A. Ionescu | asist. B. Popa AC0-1', dicts);
    expect(a?.professors).toEqual(['prof. A. Ionescu, asist. B. Popa']);
  });

  it('splits two activities sharing one interval', () => {
    const found = parseActivities('DCE L i BF A0-10 DCE L p POl E407', dicts);
    expect(found).toHaveLength(2);
    expect(found[0]?.rooms).toEqual(['A0-10']);
    expect(found[1]?.rooms).toEqual(['E407']);
  });

  it('ignores text that is not an activity', () => {
    expect(parseActivities('Sintaxa descrierii activităților', dicts)).toEqual([]);
  });
});

describe('XlsxAdapter on the real faculty file', () => {
  it('parses every sheet without errors', async () => {
    const adapter = XlsxAdapter.fromBuffer(readFileSync(REAL));
    const { entries, errors } = await adapter.parse(await adapter.fetch());

    expect(errors).toEqual([]);
    expect(entries.length).toBeGreaterThan(1500);

    // a silent drop of rooms or teachers is the failure mode worth guarding
    const withRoom = entries.filter((e) => e.room).length;
    const withProfessor = entries.filter((e) => e.professor).length;
    expect(withRoom / entries.length).toBeGreaterThan(0.9);
    expect(withProfessor / entries.length).toBeGreaterThan(0.9);
  });

  it('finds the licence groups and both subgroups', async () => {
    const adapter = XlsxAdapter.fromBuffer(readFileSync(REAL));
    const { entries } = await adapter.parse(await adapter.fetch());

    const groups = new Set(entries.map((e) => e.groupName));
    expect(groups.has('1101')).toBe(true);
    expect(groups.has('1406')).toBe(true);

    const subgroups = new Set(entries.filter((e) => e.groupName === '1101').map((e) => e.subgroup));
    expect([...subgroups].sort()).toEqual([1, 2]);
  });

  it('resolves acronyms to the full subject name from the course rows', async () => {
    const adapter = XlsxAdapter.fromBuffer(readFileSync(REAL));
    const { entries } = await adapter.parse(await adapter.fetch());

    const subjects = new Set(entries.map((e) => e.subject));
    expect(subjects.has('Electrotehnică')).toBe(true);
    expect(subjects.has('Matematici aplicate în inginerie')).toBe(true);
  });
});
