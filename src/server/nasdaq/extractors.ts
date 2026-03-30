/**
 * Robust data extraction layer for Nasdaq API responses.
 * All functions are safe against null/undefined input and return typed values.
 * Never returns display strings — only raw numbers or null.
 */

import type { SummaryPayload, DividendRow } from './schemas.js';

/**
 * Parse a monetary string or number into a float.
 * Strips currency symbols ($), commas, and whitespace.
 * Returns null for non-numeric, empty, or sentinel values.
 */
export function parseMoney(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/[$,\s]/g, '').trim();
  if (!s || s.toLowerCase() === 'n/a' || s === '--' || s === '0.00') return null;
  const f = parseFloat(s);
  return isNaN(f) || !isFinite(f) ? null : f;
}

/**
 * Extract the last sale price from a validated summary payload.
 * Tries multiple field names in priority order.
 */
export function extractPrice(summaryData: SummaryPayload | null): number | null {
  if (!summaryData?.data) return null;
  const d = summaryData.data;
  return (
    parseMoney(d.lastSalePrice) ??
    parseMoney(d.lastSale) ??
    parseMoney(d.lastTrade) ??
    null
  );
}

/**
 * Extract the 52-week price range from a validated summary payload.
 */
export function extract52WRange(summaryData: SummaryPayload | null): {
  low: number | null;
  high: number | null;
} {
  if (!summaryData?.data) return { low: null, high: null };
  const d = summaryData.data;
  return {
    low: parseMoney(d.fiftyTwoWeekLow) ?? parseMoney(d.yearLow) ?? null,
    high: parseMoney(d.fiftyTwoWeekHigh) ?? parseMoney(d.yearHigh) ?? null,
  };
}

/**
 * Convert a date value to an ISO 8601 string ("YYYY-MM-DD") or null.
 * Handles: MM/DD/YYYY, YYYY-MM-DD, and other Date-parseable formats.
 * Rejects sentinel strings ("N/A", "--", "n/a").
 */
export function toIsoDate(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || s.toLowerCase() === 'n/a' || s === '--') return null;

  // MM/DD/YYYY — the most common Nasdaq format
  const mmddyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const [, mm, dd, yyyy] = mmddyyyy;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Fallback — attempt native Date parsing
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/**
 * Normalise a raw dividend row into a structured event object.
 */
export interface DividendEvent {
  exDate: string | null;
  recordDate: string | null;
  payDate: string | null;
  amount: number | null;
}

export function extractDividendEvent(row: DividendRow): DividendEvent {
  return {
    exDate: toIsoDate(row.exOrEffDate ?? row.exDate),
    recordDate: toIsoDate(row.recordDate),
    payDate: toIsoDate(row.paymentDate ?? row.payDate),
    amount: parseMoney(row.amount),
  };
}
