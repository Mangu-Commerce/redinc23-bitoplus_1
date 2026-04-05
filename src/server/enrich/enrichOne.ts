/**
 * Single ticker enrichment orchestrator.
 * Authoritative business logic boundary for one ticker.
 *
 * Owns: asset resolution, endpoint selection, extraction, dividend derivation,
 * frequency inference, response shaping into EnrichedTickerResponse.
 */

import { fetchWithRetry } from '../http/fetchWithRetry.js';
import { parseDividendsPayload, parseSummaryPayload } from '../nasdaq/schemas.js';
import {
  extractPrice,
  extract52WRange,
  extractDividendEvent,
  type DividendEvent,
} from '../nasdaq/extractors.js';
import { getCached } from '../cache/cache.js';
import { calcAnnualDiv, calcYield } from '../finance/yield.js';
import { inferFrequency } from '../finance/frequency.js';
import type { EnrichedTickerResponse, AssetType } from '../../shared/api.js';

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nasdaq.com',
  'Referer': 'https://www.nasdaq.com/',
};

/** Nasdaq asset class probe order */
const ASSET_CLASSES = ['etf', 'stocks', 'stock', 'funds', 'mutualfunds'] as const;
type AssetClass = typeof ASSET_CLASSES[number];

function assetClassToType(ac: AssetClass): AssetType {
  if (ac === 'etf') return 'etf';
  if (ac === 'stocks' || ac === 'stock') return 'stock';
  if (ac === 'funds' || ac === 'mutualfunds') return 'fund';
  return 'unknown';
}

/**
 * Attempt to fetch a Nasdaq endpoint for each asset class in order.
 * Returns the first response whose `data` field is non-null, along with the
 * matched asset class. Returns null if all classes fail or return empty data.
 */
async function fetchNasdaqData(
  ticker: string,
  pathTemplate: string,
): Promise<{ data: unknown; assetClass: AssetClass } | null> {
  for (const ac of ASSET_CLASSES) {
    const url = `https://api.nasdaq.com/api/${pathTemplate.replace('{ticker}', ticker)}?assetclass=${ac}`;
    try {
      const resp = await fetchWithRetry(url, REQUEST_HEADERS, { timeoutMs: 6000, maxRetries: 1 });
      const json = await resp.json() as { data?: unknown };
      if (json && json.data != null) {
        return { data: json, assetClass: ac };
      }
    } catch {
      // Silently continue to next asset class — error logged at outer level
    }
    // Polite 150ms gap between asset class probes to avoid rate limiting
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

/**
 * Enrich a single ticker. Checks cache first.
 * Never throws — returns status:'error' on failure.
 */
export async function enrichOne(
  ticker: string,
  yieldHint: number,
): Promise<EnrichedTickerResponse> {
  return getCached(ticker, () => fetchAndEnrich(ticker, yieldHint));
}

async function fetchAndEnrich(
  ticker: string,
  yieldHint: number,
): Promise<EnrichedTickerResponse> {
  const base: EnrichedTickerResponse = {
    ticker,
    assetType: 'unknown',
    status: 'missing',
    yieldTtm: yieldHint,
    lastPrice: null,
    annualDiv: null,
    frequency: null,
    frequencyConfidence: null,
    range52W: { low: null, high: null },
    exDate: null,
    recordDate: null,
    payDate: null,
  };

  try {
    // Fetch dividends and summary concurrently
    const [divResult, summaryResult] = await Promise.all([
      fetchNasdaqData(ticker, 'quote/{ticker}/dividends'),
      fetchNasdaqData(ticker, 'quote/{ticker}/summary'),
    ]);

    // Resolve asset type from whichever call succeeded first
    const assetType: AssetType =
      divResult ? assetClassToType(divResult.assetClass) :
      summaryResult ? assetClassToType(summaryResult.assetClass) :
      'unknown';

    // Parse and validate payloads
    const divPayload = divResult ? parseDividendsPayload(divResult.data) : null;
    const summaryPayload = summaryResult ? parseSummaryPayload(summaryResult.data) : null;

    // Extract price and range
    const lastPrice = extractPrice(summaryPayload);
    const range52W = extract52WRange(summaryPayload);

    // Extract and sort dividend events (descending by date)
    const events: DividendEvent[] = divPayload
      ? divPayload.data.dividends.rows.map(extractDividendEvent)
      : [];
    events.sort((a, b) =>
      (b.exDate ?? '').localeCompare(a.exDate ?? ''),
    );

    // Finance calculations
    const annualDiv = calcAnnualDiv(events);
    const computedYield = calcYield(annualDiv, lastPrice);
    const { frequency, confidence: frequencyConfidence } = inferFrequency(events);

    // Most recent event for date fields
    const mostRecent = events[0] ?? null;

    const hasUsableData = lastPrice !== null || events.length > 0;

    if (!hasUsableData) {
      console.warn(`[${ticker}] Missing usable data. Price found: ${lastPrice != null}, Dividends count: ${events.length}`);
    }

    return {
      ticker,
      assetType,
      status: hasUsableData ? 'success' : 'missing',
      yieldTtm: computedYield ?? yieldHint,
      lastPrice,
      annualDiv,
      frequency,
      frequencyConfidence,
      range52W,
      exDate: mostRecent?.exDate ?? null,
      recordDate: mostRecent?.recordDate ?? null,
      payDate: mostRecent?.payDate ?? null,
    };
  } catch (err) {
    console.error(`[${ticker}] Enrichment Error:`, err);
    return {
      ...base,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
