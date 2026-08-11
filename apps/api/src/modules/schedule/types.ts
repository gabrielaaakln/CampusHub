import type { RawEntry } from '@campushub/shared';

export type TermRef = {
  id: number;
  facultyId: number;
  academicYear: string;
  semester: number;
};

export type RawSource = {
  buffer: Buffer;
  contentType: string;
  url?: string;
  filename?: string;
};

export type ParseResult = {
  entries: RawEntry[];
  errors: { line: number; message: string }[];
};

export interface ScheduleAdapter {
  name: string;
  fetch(term: TermRef): Promise<RawSource>;
  parse(src: RawSource): Promise<ParseResult>;
}
