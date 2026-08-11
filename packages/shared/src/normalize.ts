// combining marks left by nfd covers breve circumflex and comma below
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** one normalisation for every _norm column alias and search query */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** norm without spaces for room numbers written as C 201 */
export function normCompact(s: string): string {
  return norm(s).replace(/ /g, '');
}
