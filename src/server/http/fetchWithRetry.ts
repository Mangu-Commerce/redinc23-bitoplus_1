/**
 * Hardened HTTP fetch primitive.
 * Owns: timeout, retry/backoff, retryable status codes, typed errors.
 */

export interface FetchOptions {
  /** Request timeout in milliseconds. Default: 8000 */
  timeoutMs?: number;
  /** Maximum number of retry attempts after the initial try. Default: 3 */
  maxRetries?: number;
  /** Base backoff delay in ms; doubles each attempt with jitter. Default: 500 */
  initialBackoffMs?: number;
}

export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status} from ${url}`);
    this.name = 'UpstreamError';
  }
}

export class TimeoutError extends Error {
  constructor(public readonly url: string, public readonly timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function backoffMs(attempt: number, initialMs: number): number {
  // Exponential backoff with ±20% jitter
  const base = initialMs * Math.pow(2, attempt);
  return Math.floor(base * (0.8 + Math.random() * 0.4));
}

/**
 * Fetch a URL with timeout, automatic retry on transient failures, and
 * typed error throwing for permanent failures.
 *
 * NOTE: A successful HTTP 200 response with `{"data": null}` is NOT an error
 * at this layer — callers must check the response body themselves.
 */
export async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  options: FetchOptions = {},
): Promise<Response> {
  const { timeoutMs = 8000, maxRetries = 3, initialBackoffMs = 500 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, { headers, signal: controller.signal });

      if (resp.ok) return resp;

      if (isRetryable(resp.status) && attempt < maxRetries) {
        lastError = new UpstreamError(resp.status, url, '');
        await new Promise(r => setTimeout(r, backoffMs(attempt, initialBackoffMs)));
        continue;
      }

      // Non-retryable 4xx — read body for context and throw immediately
      const body = await resp.text().catch(() => '');
      throw new UpstreamError(resp.status, url, body);
    } catch (err) {
      if (err instanceof UpstreamError) throw err;

      // AbortError means our timeout fired
      if ((err as { name?: string }).name === 'AbortError') {
        const te = new TimeoutError(url, timeoutMs);
        if (attempt < maxRetries) {
          lastError = te;
          await new Promise(r => setTimeout(r, backoffMs(attempt, initialBackoffMs)));
          continue;
        }
        throw te;
      }

      // Network / DNS errors — retryable
      lastError = err as Error;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, backoffMs(attempt, initialBackoffMs)));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error(`fetchWithRetry exhausted retries for ${url}`);
}
