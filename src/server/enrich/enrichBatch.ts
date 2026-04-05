/**
 * Bounded-concurrency batch enrichment processor.
 * Accepts an array of ticker seeds and returns enriched results in the same order.
 * Uses p-limit to prevent upstream request spray.
 */

import pLimit from 'p-limit';
import { enrichOne } from './enrichOne.js';
import type { EnrichedTickerResponse, TickerSeed } from '../../shared/api.js';

/**
 * Enrich an array of tickers with bounded concurrency.
 *
 * @param seeds    Array of { ticker, yieldHint } objects
 * @param concurrency  Max simultaneous enrichment calls (default: 5)
 * @returns        Array of EnrichedTickerResponse in the same order as seeds
 */
export async function enrichBatch(
  seeds: TickerSeed[],
  concurrency = 2,
): Promise<EnrichedTickerResponse[]> {
  const limit = pLimit(concurrency);
  const tasks = seeds.map(seed =>
    limit(async () => {
      // Tiny jitter/gap to stay under rate limit
      await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
      return enrichOne(seed.ticker, seed.yieldHint);
    }),
  );
  return Promise.all(tasks);
}
