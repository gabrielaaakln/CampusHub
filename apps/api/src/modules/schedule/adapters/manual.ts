import { readFile } from 'node:fs/promises';
import { parseScheduleCsv } from '../csv.js';
import type { ParseResult, RawSource, ScheduleAdapter } from '../types.js';

// the n0 path a human puts a csv in front of the same pipeline the scraper will use
export class ManualAdapter implements ScheduleAdapter {
  readonly name = 'manual';

  private constructor(private readonly source: RawSource) {}

  static fromBuffer(buffer: Buffer, filename?: string): ManualAdapter {
    return new ManualAdapter({ buffer, contentType: 'text/csv', ...(filename ? { filename } : {}) });
  }

  static async fromFile(path: string): Promise<ManualAdapter> {
    const buffer = await readFile(path);
    return new ManualAdapter({ buffer, contentType: 'text/csv', filename: path });
  }

  fetch(): Promise<RawSource> {
    return Promise.resolve(this.source);
  }

  parse(src: RawSource): Promise<ParseResult> {
    return Promise.resolve(parseScheduleCsv(src.buffer.toString('utf8')));
  }
}
