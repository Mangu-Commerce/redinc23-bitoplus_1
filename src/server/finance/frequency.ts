/**
 * Confidence-based dividend cadence inference.
 * Uses bucket classification over normalised inter-payment gaps.
 * Returns a frequency label and a confidence level.
 */

import type { DividendFrequency } from '../../shared/api.js';
import type { DividendEvent } from '../nasdaq/extractors.js';

export interface FrequencyResult {
  frequency: DividendFrequency;
  confidence: 'high' | 'medium' | 'low';
}

interface Bucket {
  label: DividendFrequency;
  minDays: number;
  maxDays: number;
}

const BUCKETS: Bucket[] = [
  { label: 'Weekly',      minDays: 5,   maxDays: 10  },
  { label: 'Monthly',     minDays: 20,  maxDays: 40  },
  { label: 'Quarterly',   minDays: 75,  maxDays: 105 },
  { label: 'Semi-Annual', minDays: 160, maxDays: 210 },
];

function classifyGap(days: number): DividendFrequency {
  for (const bucket of BUCKETS) {
    if (days >= bucket.minDays && days <= bucket.maxDays) return bucket.label;
  }
  return 'Irregular';
}

/**
 * Infer the dividend payment frequency from a list of dividend events.
 *
 * - Uses up to 12 most recent events (sorted descending by date).
 * - Computes gaps between consecutive pay/ex dates.
 * - Ignores anomalous gaps > 200 days (e.g. payment suspension, data gaps).
 * - Requires at least 3 valid gaps; returns low-confidence null otherwise.
 * - Confidence is based on the fraction of gaps in the dominant bucket.
 */
export function inferFrequency(events: DividendEvent[]): FrequencyResult {
  const LOW: FrequencyResult = { frequency: null, confidence: 'low' };

  // Collect valid dates from up to 12 most recent events
  const dates: Date[] = [];
  for (const ev of events.slice(0, 12)) {
    const dateStr = ev.payDate ?? ev.exDate;
    if (!dateStr) continue;
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) dates.push(d);
  }

  // Sort ascending for gap calculation
  dates.sort((a, b) => a.getTime() - b.getTime());

  if (dates.length < 2) return LOW;

  // Compute gaps in days; skip anomalies (> 200 days)
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const diffMs = dates[i].getTime() - dates[i - 1].getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 0 && diffDays <= 200) gaps.push(diffDays);
  }

  if (gaps.length < 3) return LOW;

  // Count gaps per bucket
  const bucketCounts = new Map<DividendFrequency, number>();
  for (const gap of gaps) {
    const label = classifyGap(gap);
    bucketCounts.set(label, (bucketCounts.get(label) ?? 0) + 1);
  }

  // Find dominant bucket
  let dominantLabel: DividendFrequency = null;
  let dominantCount = 0;
  for (const [label, count] of bucketCounts) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantLabel = label;
    }
  }

  const ratio = dominantCount / gaps.length;

  let confidence: 'high' | 'medium' | 'low';
  if (ratio >= 0.8) confidence = 'high';
  else if (ratio >= 0.5) confidence = 'medium';
  else confidence = 'low';

  return { frequency: dominantLabel, confidence };
}
