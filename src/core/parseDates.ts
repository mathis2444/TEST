export function dt(value: unknown): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`);
  const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) return new Date(`${fr[3]}-${fr[2]}-${fr[1]}T00:00:00`);
  return null;
}

export function overlapsPeriod(start: Date | null, end: Date | null, selectedStart: Date, selectedEnd: Date): boolean {
  const s = start ?? selectedStart;
  const e = end ?? s;
  return e >= selectedStart && s <= selectedEnd;
}
