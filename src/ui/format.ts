/**
 * Frontend-only formatting boundary.
 * All functions receive raw typed values and return display strings.
 * The em dash "—" is the single null placeholder — never "N/A" or "...".
 */

import type { DividendFrequency } from '../shared/api';

const NULL_PLACEHOLDER = '—';

/**
 * Format a number as USD currency: "$12.34"
 * Returns "—" for null/undefined.
 */
export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return NULL_PLACEHOLDER;
  return `$${n.toFixed(2)}`;
}

/**
 * Format a decimal ratio as a percentage: 7.7417 → "774.17%"
 * Returns "—" for null/undefined.
 */
export function formatYield(n: number | null | undefined): string {
  if (n == null) return NULL_PLACEHOLDER;
  return `${(n * 100).toFixed(2)}%`;
}

/**
 * Format an ISO date string for display: "2025-03-20" → "2025-03-20"
 * Returns "—" for null/undefined/empty.
 */
export function formatDate(s: string | null | undefined): string {
  if (!s) return NULL_PLACEHOLDER;
  return s;
}

/**
 * Format a 52-week range from raw low/high numbers: "$12.50 – $34.20"
 * Returns "—" if either value is null.
 */
export function formatRange(
  low: number | null | undefined,
  high: number | null | undefined,
): string {
  if (low == null || high == null) return NULL_PLACEHOLDER;
  return `${formatCurrency(low)} \u2013 ${formatCurrency(high)}`;
}

/**
 * Format a dividend frequency label.
 * Returns "—" for null.
 */
export function formatFrequency(f: DividendFrequency): string {
  return f ?? NULL_PLACEHOLDER;
}

/**
 * Compute and format the average yield across an array of decimal ratio values.
 * Skips nulls. Returns "—" if no valid values.
 */
export function formatAvgYield(yields: Array<number | null>): string {
  const valid = yields.filter((y): y is number => y !== null);
  if (valid.length === 0) return NULL_PLACEHOLDER;
  const avg = valid.reduce((sum, y) => sum + y, 0) / valid.length;
  return formatYield(avg);
}
