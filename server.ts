import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { z } from 'zod';

import { enrichBatch } from './src/server/enrich/enrichBatch.js';
import { generateInsight } from './src/server/ai/generateInsight.js';
import type {
  BatchEnrichRequest,
  BatchEnrichResponse,
  ApiError,
  InsightRequest,
  InsightResponse,
} from './src/shared/api.js';
import { TICKER_SEEDS } from './src/shared/seeds.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT ?? 3000);

  app.use(express.json());

  function logError(requestId: string, context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(JSON.stringify({
      level: 'error',
      requestId,
      context,
      message,
      stack,
      timestamp: new Date().toISOString(),
    }));
  }

  // Inject a unique request ID on every request
  app.use((req: Request, res: Response, next: NextFunction) => {
    (req as Request & { requestId: string }).requestId = randomUUID();
    res.setHeader('X-Request-Id', (req as Request & { requestId: string }).requestId);
    next();
  });

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  const InsightRequestSchema = z.object({
    question: z.string().trim().min(3, 'question required (min 3 chars)'),
    tickers: z.array(
      z.object({
        symbol: z.string().trim().min(1),
        name: z.string().trim().nullable().optional(),
        price: z.number().nullable().optional(),
        annualDividend: z.number().nullable().optional(),
        dividendYield: z.number().nullable().optional(),
        exDividendDate: z.string().trim().nullable().optional(),
        paymentFrequency: z.string().trim().nullable().optional(),
      }),
    ).min(1, 'tickers array required'),
  });

  /** Return the full seed list with numeric yield hints */
  app.get('/api/tickers', (_req: Request, res: Response) => {
    res.json(TICKER_SEEDS);
  });

  const BatchEnrichSchema = z.object({
    tickers: z.array(z.string().trim().min(1)).min(1, 'tickers array must be non-empty'),
  });

  /** Batch enrich — replaces the old sequential /api/enrich/:ticker pattern */
  app.post('/api/v2/enrich', async (req: Request, res: Response) => {
    const requestId = (req as Request & { requestId: string }).requestId;

    const parsed = BatchEnrichSchema.safeParse(req.body);
    if (!parsed.success) {
      const payload: ApiError = {
        error: parsed.error.issues[0]?.message ?? 'Invalid tickers payload',
        requestId,
        status: 400,
      };
      return res.status(400).json(payload);
    }

    const requested = new Set(parsed.data.tickers.map((t: string) => t.toUpperCase()));
    const seeds = TICKER_SEEDS.filter(s => requested.has(s.ticker));

    if (seeds.length === 0) {
      const err: ApiError = { error: 'No recognised tickers in request', requestId, status: 400 };
      return res.status(400).json(err);
    }

    try {
      const start = Date.now();
      const results = await enrichBatch(seeds);
      const response: BatchEnrichResponse = {
        results,
        requestId,
        durationMs: Date.now() - start,
      };
      res.json(response);
    } catch (error) {
      logError(requestId, 'POST /api/v2/enrich error', error);
      const payload: ApiError = {
        error: 'Failed to enrich tickers',
        requestId,
        status: 500,
      };
      return res.status(500).json(payload);
    }
  });

  app.post(
    '/api/insights',
    async (
      req: Request<unknown, InsightResponse | ApiError, InsightRequest>,
      res: Response<InsightResponse | ApiError>,
    ) => {
      const requestId = (req as Request & { requestId: string }).requestId;

      const parsed = InsightRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const payload: ApiError = {
          error: parsed.error.issues[0]?.message ?? 'Invalid insight request',
          requestId,
          status: 400,
        };
        return res.status(400).json(payload);
      }

      try {
        const result = await generateInsight(parsed.data);
        return res.json(result);
      } catch (error) {
        logError(requestId, 'POST /api/insights error', error);

        if (error instanceof Error && error.name === 'UnconfiguredError') {
          const payload: ApiError = {
            error: 'Insights not configured (missing API key)',
            requestId,
            status: 503,
          };
          return res.status(503).json(payload);
        }

        const payload: ApiError = {
          error: 'Failed to generate insight',
          requestId,
          status: 500,
        };
        return res.status(500).json(payload);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Vite dev middleware / static production serving
  // ---------------------------------------------------------------------------

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // ---------------------------------------------------------------------------
  // Structured error middleware
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId ?? 'unknown';
    logError(requestId, 'Unhandled Express middleware error', err);
    const payload: ApiError = {
      error: err.message ?? 'Internal server error',
      requestId,
      status: 500,
    };
    res.status(500).json(payload);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(JSON.stringify({
      level: 'info',
      message: 'Server running',
      port: PORT,
      timestamp: new Date().toISOString(),
    }));
  });
}

startServer();
