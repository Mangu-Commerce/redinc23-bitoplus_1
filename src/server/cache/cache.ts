/**
 * TTL cache with in-flight promise deduplication.
 *
 * - Prevents duplicate concurrent upstream calls for the same ticker.
 * - Caches successful results for TTL_SECONDS to avoid repeat fetches.
 * - In-flight entries are removed in .finally() to prevent memory leaks.
 */

import NodeCache from 'node-cache';
import type { EnrichedTickerResponse } from '../../shared/api.js';

const TTL_SECONDS = 300; // 5 minutes

const store = new NodeCache({ stdTTL: TTL_SECONDS, checkperiod: 60 });
const inFlight = new Map<string, Promise<EnrichedTickerResponse>>();

/**
 * Return a cached result if available, otherwise call fetcher() once
 * (even if multiple callers request the same ticker concurrently).
 */
export async function getCached(
  ticker: string,
  fetcher: () => Promise<EnrichedTickerResponse>,
): Promise<EnrichedTickerResponse> {
  // Cache hit
  const cached = store.get<EnrichedTickerResponse>(ticker);
  if (cached !== undefined) return cached;

  // In-flight dedupe — if someone is already fetching this ticker, reuse their promise
  const existing = inFlight.get(ticker);
  if (existing) return existing;

  const promise = fetcher().then(
    result => {
      // Only cache successful/missing results, not errors (let them retry)
      if (result.status !== 'error') {
        store.set(ticker, result);
      }
      return result;
    },
  ).finally(() => {
    inFlight.delete(ticker);
  });

  inFlight.set(ticker, promise);
  return promise;
}

/** Manually invalidate a cached entry (e.g. for testing). */
export function invalidate(ticker: string): void {
  store.del(ticker);
}

/** Flush the entire cache. */
export function flushAll(): void {
  store.flushAll();
}
