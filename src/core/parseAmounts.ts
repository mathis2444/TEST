export function num(value: unknown): number {
  if (value == null) return 0;
  let s = String(value).trim().replace(/\u202f/g, '').replace(/\s/g, '').replace('€', '').replace(',', '.');
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}
