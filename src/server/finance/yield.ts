/**
 * Derived yield logic.
 * Calculates TTM (trailing twelve months) annual dividend and yield from price.
 */

import type { DividendEvent } from '../nasdaq/extractors.js';

/**
 * Sum dividend amounts for events whose effective date falls within the
 * trailing twelve months ending at `now` (defaults to current date).
 *
 * Uses payDate if available, falls back to exDate.
 * Returns null if no valid events fall in the window.
 */
export function calcAnnualDiv(
  events: DividendEvent[],
  now: Date = new Date(),
): number | null {
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  let total = 0;
  let count = 0;

  for (const ev of events) {
    if (ev.amount === null) continue;
    const dateStr = ev.payDate ?? ev.exDate;
    if (!dateStr) continue;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;
    if (d > now || d < oneYearAgo) continue;
    total += ev.amount;
    count++;
  }

  return count > 0 ? total : null;
}

/**
 * Calculate dividend yield as a decimal ratio (e.g. 7.7417 = 774.17%).
 * Returns null if either argument is null or price is zero.
 */
export function calcYield(
  annualDiv: number | null,
  price: number | null,
): number | null {
  if (annualDiv === null || price === null || price === 0) return null;
  return annualDiv / price;
}
