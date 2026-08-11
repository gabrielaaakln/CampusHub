import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCsv, parseScheduleCsv } from './csv.js';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../../fixtures/schedule/${name}`, import.meta.url)), 'utf8');

describe('parseCsv', () => {
  it('keeps commas inside quoted fields', () => {
    const rows = parseCsv('a,b\n"x, y",z\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'z'],
    ]);
  });

  it('unescapes doubled quotes and ignores blank lines', () => {
    expect(parseCsv('a\n"he said ""hi"""\n\n')).toEqual([['a'], ['he said "hi"']]);
  });
});

describe('parseScheduleCsv', () => {
  it('parses the real fixture without errors', () => {
    const result = parseScheduleCsv(fixture('tuiasi-ac-sem1.csv'));
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(40);
  });

  it('keeps two parallel labs in the same time slot', () => {
    const { entries } = parseScheduleCsv(fixture('tuiasi-ac-sem1.csv'));
    const parallel = entries.filter(
      (e) => e.groupName === 'CTI 3A' && e.day === 'luni' && e.startTime === '12:00',
    );
    expect(parallel.map((e) => e.subgroup).sort()).toEqual([1, 2]);
  });

  it('reports bad rows instead of dropping them', () => {
    const text = ['group,subgroup,day,start,end,type,parity,subject', 'A,0,lunea,08:00,10:00,curs,ambele,X'].join(
      '\n',
    );
    const result = parseScheduleCsv(text);
    expect(result.entries).toHaveLength(0);
    expect(result.errors[0]?.line).toBe(2);
  });

  it('rejects an end time before the start time', () => {
    const text = ['group,subgroup,day,start,end,type,parity,subject', 'A,0,luni,10:00,08:00,curs,ambele,X'].join(
      '\n',
    );
    expect(parseScheduleCsv(text).errors).toHaveLength(1);
  });

  it('accepts a file saved by excel with a byte order mark', () => {
    const text = '﻿group,subgroup,day,start,end,type,parity,subject\nCTI 3A,0,luni,08:00,10:00,curs,ambele,X';
    const result = parseScheduleCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
  });

  it('refuses a file whose columns changed', () => {
    const result = parseScheduleCsv('grupa;zi;ora\nCTI 3A;luni;08:00');
    expect(result.entries).toEqual([]);
    expect(result.errors[0]?.message).toContain('Lipsesc coloanele');
  });
});
