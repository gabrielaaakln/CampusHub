import { describe, expect, it } from 'vitest';
import { norm, normCompact } from './normalize.js';
import { isAllowedEmailDomain } from './auth.js';

describe('norm', () => {
  it('strips diacritics, including s and t with comma below', () => {
    expect(norm('Rețele de Calculatoare')).toBe('retele de calculatoare');
    expect(norm('Științe')).toBe('stiinte');
    expect(norm('ÎNVĂȚĂMÂNT')).toBe('invatamant');
  });

  it('collapses punctuation and whitespace', () => {
    expect(norm('  Corp   A,  et. 2 ')).toBe('corp a et 2');
    expect(norm('Lab. Rețele - II')).toBe('lab retele ii');
  });

  it('is idempotent', () => {
    const once = norm('Programarea Calculatoarelor');
    expect(norm(once)).toBe(once);
  });

  it('compacts room numbers', () => {
    expect(normCompact('C 201')).toBe('c201');
    expect(normCompact('c-201')).toBe('c201');
  });
});

describe('isAllowedEmailDomain', () => {
  const allowed = ['tuiasi.ro', 'student.tuiasi.ro'];

  it('accepts the domain and its subdomains', () => {
    expect(isAllowedEmailDomain('ana@tuiasi.ro', allowed)).toBe(true);
    expect(isAllowedEmailDomain('ana@ac.tuiasi.ro', allowed)).toBe(true);
    expect(isAllowedEmailDomain('ana@student.tuiasi.ro', allowed)).toBe(true);
  });

  it('rejects lookalikes', () => {
    expect(isAllowedEmailDomain('ana@gmail.com', allowed)).toBe(false);
    expect(isAllowedEmailDomain('ana@nottuiasi.ro', allowed)).toBe(false);
    expect(isAllowedEmailDomain('tuiasi.ro@gmail.com', allowed)).toBe(false);
  });
});
