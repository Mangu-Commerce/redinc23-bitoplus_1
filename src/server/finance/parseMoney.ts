export function parseMoney(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'N/A' || trimmed === '--') return null;
  const normalized = trimmed.replace(/[$,]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
