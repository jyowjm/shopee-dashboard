// Canonical names for Malaysian states that appear under multiple aliases in
// Shopee/TikTok recipient address fields and uploaded report exports.
const STATE_ALIASES: Record<string, string> = {
  'kuala lumpur': 'W.P. Kuala Lumpur',
  'w.p. kuala lumpur': 'W.P. Kuala Lumpur',
  'wp kuala lumpur': 'W.P. Kuala Lumpur',
  'wilayah persekutuan kuala lumpur': 'W.P. Kuala Lumpur',
  putrajaya: 'W.P. Putrajaya',
  'w.p. putrajaya': 'W.P. Putrajaya',
  'wp putrajaya': 'W.P. Putrajaya',
  'wilayah persekutuan putrajaya': 'W.P. Putrajaya',
  penang: 'Pulau Pinang',
  'pulau pinang': 'Pulau Pinang',
  georgetown: 'Pulau Pinang',
  labuan: 'W.P. Labuan',
  'w.p. labuan': 'W.P. Labuan',
  'wp labuan': 'W.P. Labuan',
};

/**
 * Normalise a raw recipient_state value to its canonical Malaysian state name.
 * Returns null for empty/whitespace and Shopee-masked values (e.g. "****").
 */
export function normaliseState(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^\*+$/.test(trimmed)) return null;
  return STATE_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Aggregate a list of raw state values into top-locations rows, sorted by count desc.
 */
export function aggregateTopLocations(
  rawStates: (string | null | undefined)[],
): { state: string; count: number }[] {
  const stateCount = new Map<string, { display: string; count: number }>();
  for (const raw of rawStates) {
    const normalised = normaliseState(raw);
    if (!normalised) continue;
    const key = normalised.toLowerCase();
    const entry = stateCount.get(key) ?? { display: normalised, count: 0 };
    stateCount.set(key, { display: entry.display, count: entry.count + 1 });
  }
  return [...stateCount.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ display, count }) => ({ state: display, count }));
}
