/**
 * Canonical shared API contract.
 * Imported by both server modules (response shaping) and client modules (consumption).
 * All fields are raw typed values — never pre-formatted display strings.
 */

/** Lifecycle status for a single ticker's enrichment data. */
export type DataStatus = 'loading' | 'success' | 'missing' | 'error';

/**
 * Resolved asset class used to select the correct Nasdaq URL path.
 * 'missing' means data came back from Nasdaq but was empty/insufficient.
 * 'error'   means the upstream call failed or threw.
 */
export type AssetType = 'etf' | 'stock' | 'fund' | 'unknown';

/** Dividend payment cadence. null means not enough data to determine. */
export type DividendFrequency =
  | 'Monthly'
  | 'Quarterly'
  | 'Semi-Annual'
  | 'Weekly'
  | 'Irregular'
  | null;

/**
 * An ISO 8601 date string ("YYYY-MM-DD") or null.
 * Never the strings "N/A", "--", or "...".
 */
export type IsoDateField = string | null;

/**
 * Per-ticker enrichment result returned by POST /api/v2/enrich.
 *
 * All numeric fields are raw numbers (not formatted strings).
 * yieldTtm is a decimal ratio: 7.7417 represents 774.17%.
 * Formatting for display is done client-side in src/ui/format.ts.
 */
export interface EnrichedTickerResponse {
  ticker: string;
  assetType: AssetType;
  /** 'success' | 'missing' | 'error' — 'loading' is a client-only state */
  status: Exclude<DataStatus, 'loading'>;
  /** Decimal ratio. Multiply by 100 to get the percentage value. */
  yieldTtm: number | null;
  lastPrice: number | null;
  annualDiv: number | null;
  frequency: DividendFrequency;
  frequencyConfidence: 'high' | 'medium' | 'low' | null;
  range52W: {
    low: number | null;
    high: number | null;
  };
  exDate: IsoDateField;
  recordDate: IsoDateField;
  payDate: IsoDateField;
  /** Present when status === 'error'. Human-readable upstream error description. */
  error?: string;
}

/**
 * Seed data for each tracked ticker.
 * yieldHint is a decimal ratio matching the yieldTtm convention above.
 */
export interface TickerSeed {
  ticker: string;
  /** Decimal ratio e.g. 7.7417 = 774.17% */
  yieldHint: number;
}

/** Request body for POST /api/v2/enrich */
export interface BatchEnrichRequest {
  tickers: string[];
}

/** Response envelope for POST /api/v2/enrich */
export interface BatchEnrichResponse {
  results: EnrichedTickerResponse[];
  requestId: string;
  durationMs: number;
}

/** Structured error payload returned on 4xx/5xx responses */
export interface ApiError {
  error: string;
  requestId: string;
  status: number;
}
