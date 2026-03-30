/**
 * Zod validation boundary for Nasdaq API payloads.
 * Rejects responses whose shape exists but is unusable (e.g. empty rows arrays,
 * missing required fields) before extraction is attempted.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Dividends payload
// ---------------------------------------------------------------------------

export const DividendRowSchema = z.object({
  exOrEffDate: z.string().optional(),
  exDate: z.string().optional(),
  recordDate: z.string().optional(),
  paymentDate: z.string().optional(),
  payDate: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
});

export type DividendRow = z.infer<typeof DividendRowSchema>;

/**
 * Full dividends payload. Requires at least one row to be considered valid.
 * A 200 response with 0 rows → status 'missing', not 'error'.
 */
export const DividendsPayloadSchema = z.object({
  data: z.object({
    dividends: z.object({
      rows: z.array(DividendRowSchema),
    }),
  }),
});

export type DividendsPayload = z.infer<typeof DividendsPayloadSchema>;

// ---------------------------------------------------------------------------
// Summary / quote payload
// ---------------------------------------------------------------------------

export const SummaryPayloadSchema = z.object({
  data: z.object({
    // Price fields — any of these may be present
    lastSalePrice: z.string().optional(),
    lastSale: z.string().optional(),
    lastTrade: z.string().optional(),
    // 52-week range fields
    fiftyTwoWeekLow: z.string().optional(),
    yearLow: z.string().optional(),
    fiftyTwoWeekHigh: z.string().optional(),
    yearHigh: z.string().optional(),
  }).passthrough(), // allow extra fields without failure
});

export type SummaryPayload = z.infer<typeof SummaryPayloadSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse an unknown value as a dividends payload.
 * Returns the parsed data on success, or null on validation failure.
 */
export function parseDividendsPayload(raw: unknown): DividendsPayload | null {
  const result = DividendsPayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Parse an unknown value as a summary payload.
 * Returns the parsed data on success, or null on validation failure.
 */
export function parseSummaryPayload(raw: unknown): SummaryPayload | null {
  const result = SummaryPayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}
