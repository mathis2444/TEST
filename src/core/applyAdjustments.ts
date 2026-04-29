import type { Adjustment } from '../types';

export function applyAdjustments(vatTheoretical: number, anomalies: any[], adjustments: Adjustment[]) {
  let out = vatTheoretical;
  const valid = adjustments.filter((a) => a.status === 'VALIDEE');
  for (const adj of valid) {
    const line = anomalies.find((a) => a.id === adj.lineId);
    if (!line) continue;
    if (adj.action === 'EXCLUDE_LINE') out -= line.normalized_amount;
    if (adj.action === 'SIGN_INVERT') out -= 2 * line.normalized_amount;
    if (adj.action === 'REMAP_COLLECTEE') out = out - line.normalized_amount + Math.abs(line.net_amount);
    if (adj.action === 'REMAP_DED_ABS' || adj.action === 'REMAP_DED_IMMO') out = out - line.normalized_amount - Math.abs(line.net_amount);
  }
  return out;
}
