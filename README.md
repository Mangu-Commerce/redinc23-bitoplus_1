<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# High-Yield Dividend Explorer

A real-time dashboard for tracking high-yield ETFs and stocks with detailed dividend schedules and price data, powered by the Nasdaq API and Google Gemini.

View your app in AI Studio: https://ai.studio/apps/5c044391-4ec1-48ee-9dad-06f257d51ce7

---

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and set your `GEMINI_API_KEY`
3. Run the app: `npm run dev`

---

## Architecture Overview

```
server.ts               Express app bootstrap, route mounting, error middleware
src/shared/api.ts       Canonical typed contract — shared by server and client
src/server/
  http/fetchWithRetry   Hardened fetch: timeout, retry, backoff, typed errors
  nasdaq/schemas        Zod validation for Nasdaq API payloads
  nasdaq/extractors     parseMoney, extractPrice, extract52WRange, toIsoDate
  cache/cache           5-minute TTL cache + in-flight promise deduplication
  finance/yield         TTM annual dividend + yield calculation
  finance/frequency     Confidence-weighted dividend cadence inference
  enrich/enrichOne      Single-ticker orchestrator (authoritative business logic)
  enrich/enrichBatch    p-limit bounded batch processor
src/ui/
  state                 TickerState with explicit DataStatus, TickerStore
  sort                  Null-safe raw-value comparators (never sorts strings)
  format                Display formatting (formatCurrency, formatYield, etc.)
src/App.tsx             Single batch call, typed store, status-driven rendering
```

---

## API Contract

### `GET /api/tickers`

Returns the seed list with numeric yield hints.

```json
[{ "ticker": "MSTY", "yieldHint": 2.9761 }, ...]
```

`yieldHint` is a decimal ratio — multiply by 100 to get the percentage value (e.g. `2.9761 → 297.61%`).

### `POST /api/v2/enrich`

**Request body:**
```json
{ "tickers": ["MSTY", "BITO", "NVDY"] }
```

**Response:**
```json
{
  "requestId": "uuid",
  "durationMs": 4231,
  "results": [{
    "ticker": "MSTY",
    "assetType": "etf",
    "status": "success",
    "yieldTtm": 2.9761,
    "lastPrice": 17.42,
    "annualDiv": 51.84,
    "frequency": "Monthly",
    "frequencyConfidence": "high",
    "range52W": { "low": 12.50, "high": 32.10 },
    "exDate": "2025-03-20",
    "recordDate": "2025-03-21",
    "payDate": "2025-03-25"
  }]
}
```

All numeric fields are raw numbers. Formatting for display happens client-side in `src/ui/format.ts`.

---

## Error / Status Taxonomy

| Status | Meaning |
|--------|---------|
| `loading` | Client-only — enrichment in flight |
| `success` | Upstream data retrieved and parsed successfully |
| `missing` | Nasdaq returned data but no usable dividend rows (normal for new/inactive tickers) |
| `error` | Upstream call failed or threw; `error` field contains the message |

`"—"` (em dash) is the single display placeholder for missing values. `"N/A"` and `"..."` do not appear anywhere in the typed data layer.

---

## Caching Behavior

- Results are cached server-side for **5 minutes** (TTL).
- In-flight promise deduplication prevents duplicate concurrent upstream calls for the same ticker.
- Only `success` and `missing` results are cached; `error` results are not (so a retry will re-fetch).
- Cache is invalidated per-ticker; a new `POST /api/v2/enrich` will serve cached results for tickers hit recently.

---

## Batch Concurrency

The server enriches tickers with a default concurrency of **5** simultaneous upstream calls (configurable in `enrichBatch.ts`). This replaces the old pattern of 66 sequential browser-initiated requests.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key for the Insights feature |

---

## Known Upstream Limitations

- **Nasdaq asset class probing:** The API requires an `assetclass` query param. The server probes `etf → stocks → stock → funds → mutualfunds` in order and uses the first non-null response.
- **Transient failures:** The fetch layer retries up to 3 times with exponential backoff on `429` and `5xx` responses. Persistent failures result in `status: 'error'`.
- **Missing dividend data:** Many tickers return valid API responses but with 0 dividend rows. These are classified as `status: 'missing'` — not errors.
- **Yield hint:** If live yield cannot be computed from TTM dividends (no events in window), the seed `yieldHint` from the ticker list is used as the displayed yield.

---

## Testing

```bash
npm run test           # run all tests once
npm run test:watch     # re-run on file change
npm run test:coverage  # generate coverage report
npm run lint           # TypeScript type checking (tsc --noEmit)
```

Test files live alongside source files or in a `__tests__` directory. Key units to test:
- `src/server/nasdaq/extractors.ts` — `parseMoney`, `toIsoDate`
- `src/server/finance/yield.ts` — `calcAnnualDiv`, `calcYield`
- `src/server/finance/frequency.ts` — `inferFrequency`
- `src/ui/format.ts` — `formatYield`, `formatCurrency`, `formatAvgYield`
- `src/ui/sort.ts` — `compareNullLast`, `sortTickers`
