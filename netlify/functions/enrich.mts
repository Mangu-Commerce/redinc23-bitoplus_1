import { randomUUID } from 'crypto';
import type { Config } from '@netlify/functions';
import { enrichBatch } from '../../src/server/enrich/enrichBatch.js';
import { TICKER_SEEDS } from '../../src/shared/seeds.js';
import type { BatchEnrichRequest, BatchEnrichResponse, ApiError } from '../../src/shared/api.js';

export default async (req: Request) => {
  const requestId = randomUUID();

  const body = await req.json() as Partial<BatchEnrichRequest>;

  if (!Array.isArray(body?.tickers) || body.tickers.length === 0) {
    const err: ApiError = { error: 'tickers must be a non-empty array', requestId, status: 400 };
    return Response.json(err, { status: 400 });
  }

  const requested = new Set(body.tickers.map((t: string) => t.toUpperCase()));
  const seeds = TICKER_SEEDS.filter(s => requested.has(s.ticker));

  if (seeds.length === 0) {
    const err: ApiError = { error: 'No recognised tickers in request', requestId, status: 400 };
    return Response.json(err, { status: 400 });
  }

  const start = Date.now();
  const results = await enrichBatch(seeds);
  const response: BatchEnrichResponse = {
    results,
    requestId,
    durationMs: Date.now() - start,
  };

  return Response.json(response);
};

export const config: Config = {
  path: '/api/v2/enrich',
  method: 'POST',
};
