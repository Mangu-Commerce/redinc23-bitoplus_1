import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { enrichBatch } from './src/server/enrich/enrichBatch.js';
import type {
  BatchEnrichRequest,
  BatchEnrichResponse,
  ApiError,
} from './src/shared/api.js';
import { TICKER_SEEDS } from './src/shared/seeds.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Inject a unique request ID on every request
  app.use((req: Request, res: Response, next: NextFunction) => {
    (req as Request & { requestId: string }).requestId = randomUUID();
    res.setHeader('X-Request-Id', (req as Request & { requestId: string }).requestId);
    next();
  });

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  /** Return the full seed list with numeric yield hints */
  app.get('/api/tickers', (_req: Request, res: Response) => {
    res.json(TICKER_SEEDS);
  });

  /** Batch enrich — replaces the old sequential /api/enrich/:ticker pattern */
  app.post('/api/v2/enrich', async (req: Request, res: Response) => {
    const requestId = (req as Request & { requestId: string }).requestId;
    const body = req.body as Partial<BatchEnrichRequest>;

    if (!Array.isArray(body?.tickers) || body.tickers.length === 0) {
      const err: ApiError = { error: 'tickers must be a non-empty array', requestId, status: 400 };
      return res.status(400).json(err);
    }

    const requested = new Set(body.tickers.map((t: string) => t.toUpperCase()));
    const seeds = TICKER_SEEDS.filter(s => requested.has(s.ticker));

    if (seeds.length === 0) {
      const err: ApiError = { error: 'No recognised tickers in request', requestId, status: 400 };
      return res.status(400).json(err);
    }

    const start = Date.now();
    const results = await enrichBatch(seeds);
    const response: BatchEnrichResponse = {
      results,
      requestId,
      durationMs: Date.now() - start,
    };
    res.json(response);
  });

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
    console.error(`[${requestId}] Unhandled error:`, err);
    const payload: ApiError = {
      error: err.message ?? 'Internal server error',
      requestId,
      status: 500,
    };
    res.status(500).json(payload);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
