/**
 * Legacy type aliases — re-exported from the canonical shared contract.
 * Prefer importing directly from '@/src/shared/api' in new code.
 */
export type {
  EnrichedTickerResponse as TickerData,
  TickerSeed as TickerBase,
  DataStatus,
  AssetType,
  DividendFrequency,
  IsoDateField,
  BatchEnrichRequest,
  BatchEnrichResponse,
  ApiError,
} from '@/src/shared/api';
