/**
 * Frontend state model.
 * Eliminates loading/error/missing ambiguity by using explicit DataStatus.
 * "loading" is a client-only state — the server never returns it.
 */

import type { DataStatus, EnrichedTickerResponse } from '../shared/api';

/**
 * The state for a single ticker in the UI store.
 * status drives rendering: loading → skeleton, success → data, missing/error → indicator.
 */
export interface TickerState {
  ticker: string;
  /** Seed yield hint (decimal ratio) shown before enrichment completes */
  yieldHint: number;
  status: DataStatus;
  data: EnrichedTickerResponse | null;
  error?: string;
}

/** The full UI store keyed by uppercase ticker symbol */
export type TickerStore = Map<string, TickerState>;

/** Create the initial loading state for a seed ticker */
export function makeLoadingState(ticker: string, yieldHint: number): TickerState {
  return { ticker, yieldHint, status: 'loading', data: null };
}

/** Build a TickerStore from seed data, preserving previous data if existing */
export function buildInitialStore(
  seeds: Array<{ ticker: string; yieldHint: number }>,
  existingStore?: TickerStore
): TickerStore {
  const store: TickerStore = new Map();
  for (const seed of seeds) {
    const existing = existingStore?.get(seed.ticker);
    if (existing) {
      store.set(seed.ticker, { ...existing, status: 'loading' });
    } else {
      store.set(seed.ticker, makeLoadingState(seed.ticker, seed.yieldHint));
    }
  }
  return store;
}

/** Apply a batch of enrichment results into an existing store (immutable update) */
export function applyResults(
  store: TickerStore,
  results: EnrichedTickerResponse[],
): TickerStore {
  const next = new Map(store);
  for (const result of results) {
    const existing = next.get(result.ticker);
    const hasPriorData = existing?.data != null;
    const isError = result.status === 'error';
    const isMissing = result.status === 'missing';
    
    // If we have an error but already had data, preserve it.
    const finalData = (isError || isMissing) && hasPriorData ? existing.data : result;

    next.set(result.ticker, {
      ticker: result.ticker,
      yieldHint: existing?.yieldHint ?? result.yieldTtm ?? 0,
      status: result.status,
      data: finalData,
      error: result.error,
    });
  }
  return next;
}
