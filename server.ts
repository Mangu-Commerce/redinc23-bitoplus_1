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
  TickerSeed,
  ApiError,
} from './src/shared/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Ticker seed list — yieldHint is a decimal ratio (7.7417 = 774.17%)
// ---------------------------------------------------------------------------

const TICKER_SEEDS: TickerSeed[] = [
  { ticker: 'MST',   yieldHint: 7.7417 },
  { ticker: 'ICOI',  yieldHint: 3.9382 },
  { ticker: 'TSYY',  yieldHint: 3.1312 },
  { ticker: 'MSTY',  yieldHint: 2.9761 },
  { ticker: 'COYY',  yieldHint: 2.9488 },
  { ticker: 'MARO',  yieldHint: 2.8223 },
  { ticker: 'SMCY',  yieldHint: 2.6820 },
  { ticker: 'IMST',  yieldHint: 2.5616 },
  { ticker: 'CONY',  yieldHint: 2.2732 },
  { ticker: 'COIW',  yieldHint: 2.1935 },
  { ticker: 'AIYY',  yieldHint: 2.1564 },
  { ticker: 'XBTY',  yieldHint: 1.9334 },
  { ticker: 'MSTW',  yieldHint: 1.8680 },
  { ticker: 'IMRA',  yieldHint: 1.8274 },
  { ticker: 'HOOW',  yieldHint: 1.7305 },
  { ticker: 'HOOY',  yieldHint: 1.6790 },
  { ticker: 'HOYY',  yieldHint: 1.5046 },
  { ticker: 'ULTY',  yieldHint: 1.3401 },
  { ticker: 'YETH',  yieldHint: 1.3182 },
  { ticker: 'NVYY',  yieldHint: 1.3036 },
  { ticker: 'FIAT',  yieldHint: 1.3013 },
  { ticker: 'MTYY',  yieldHint: 1.2547 },
  { ticker: 'CVNY',  yieldHint: 1.2490 },
  { ticker: 'PLTY',  yieldHint: 1.2193 },
  { ticker: 'SMYY',  yieldHint: 1.1754 },
  { ticker: 'PLTW',  yieldHint: 1.1724 },
  { ticker: 'XYZY',  yieldHint: 1.1560 },
  { ticker: 'SNOY',  yieldHint: 1.1422 },
  { ticker: 'LFGY',  yieldHint: 1.0822 },
  { ticker: 'YBIT',  yieldHint: 1.0607 },
  { ticker: 'MAAY',  yieldHint: 1.0449 },
  { ticker: 'TSLW',  yieldHint: 1.0309 },
  { ticker: 'IOYY',  yieldHint: 1.0174 },
  { ticker: 'TSLY',  yieldHint: 1.0099 },
  { ticker: 'AMDY',  yieldHint: 0.9785 },
  { ticker: 'CRSH',  yieldHint: 0.9706 },
  { ticker: 'FEAT',  yieldHint: 0.9645 },
  { ticker: 'BABO',  yieldHint: 0.8975 },
  { ticker: 'MRNY',  yieldHint: 0.8962 },
  { ticker: 'WNTR',  yieldHint: 0.8957 },
  { ticker: 'YMAX',  yieldHint: 0.8899 },
  { ticker: 'YBTC',  yieldHint: 0.8850 },
  { ticker: 'BITO',  yieldHint: 0.8695 },
  { ticker: 'DRAY',  yieldHint: 0.8384 },
  { ticker: 'RBLY',  yieldHint: 0.8337 },
  { ticker: 'BITU',  yieldHint: 0.8291 },
  { ticker: 'HMYY',  yieldHint: 0.8045 },
  { ticker: 'IGME',  yieldHint: 0.8006 },
  { ticker: 'PYPY',  yieldHint: 0.7905 },
  { ticker: 'HIYY',  yieldHint: 0.7883 },
  { ticker: 'RDYY',  yieldHint: 0.7819 },
  { ticker: 'RGYY',  yieldHint: 0.7744 },
  { ticker: 'PLYY',  yieldHint: 0.7687 },
  { ticker: 'NVDY',  yieldHint: 0.7535 },
  { ticker: 'AMYY',  yieldHint: 0.7319 },
  { ticker: 'NVDW',  yieldHint: 0.7161 },
];

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
