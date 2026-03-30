/**
 * Deterministic raw-value sorting utilities.
 * Operates on numeric fields and raw strings — never on formatted display values.
 * Nulls always sort last regardless of direction.
 */

import type { TickerState } from './state';

export type SortDirection = 'asc' | 'desc';

export type SortKey =
  | 'ticker'
  | 'yieldTtm'
  | 'lastPrice'
  | 'annualDiv'
  | 'exDate'
  | 'payDate';

/**
 * Null-safe comparator. Nulls always sort to the end.
 */
export function compareNullLast<T>(
  a: T | null | undefined,
  b: T | null | undefined,
  direction: SortDirection,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;   // a goes after b
  if (b == null) return -1;  // b goes after a
  if (a < b) return direction === 'asc' ? -1 : 1;
  if (a > b) return direction === 'asc' ? 1 : -1;
  return 0;
}

function getRawValue(state: TickerState, key: SortKey): string | number | null {
  if (key === 'ticker') return state.ticker;
  const d = state.data;
  if (!d) {
    // Before enrichment: use yieldHint for yield sorting, null for others
    return key === 'yieldTtm' ? state.yieldHint : null;
  }
  switch (key) {
    case 'yieldTtm':   return d.yieldTtm;
    case 'lastPrice':  return d.lastPrice;
    case 'annualDiv':  return d.annualDiv;
    case 'exDate':     return d.exDate;
    case 'payDate':    return d.payDate;
    default:           return null;
  }
}

/**
 * Sort an array of TickerState by a given field and direction.
 * Returns a new array (does not mutate input).
 */
export function sortTickers(
  rows: TickerState[],
  key: SortKey,
  direction: SortDirection,
): TickerState[] {
  return [...rows].sort((a, b) =>
    compareNullLast(getRawValue(a, key), getRawValue(b, key), direction),
  );
}
