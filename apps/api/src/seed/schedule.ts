import { fileURLToPath } from 'node:url';
import { XlsxAdapter } from '../modules/schedule/adapters/xlsx.js';
import { runImport, type ImportReport } from '../modules/schedule/importer.js';
import type { TermRef } from '../modules/schedule/types.js';
import { WORKBOOK } from './campus.js';

// the seed goes through the same pipeline as an upload so a fresh database
// already has a scrape run and a change history to show
export async function seedSchedule(term: TermRef): Promise<ImportReport> {
  const adapter = await XlsxAdapter.fromFile(fileURLToPath(WORKBOOK));
  const report = await runImport(term, adapter, 'import');
  if (report.status === 'failed') {
    throw new Error(`schedule import failed:\n${report.errors.join('\n')}`);
  }
  return report;
}
