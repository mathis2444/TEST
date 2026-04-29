import type { Adjustment, ReconciliationSummary } from '../types';

export interface PortfolioEntryInput {
  company_id: string;
  company_name?: string;
  period_start: string;
  period_end: string;
  summary: ReconciliationSummary;
  controls: Array<{ level: string }>;
  anomalies: Array<{ id: string }>;
  adjustments: Adjustment[];
}

export interface PortfolioEntry {
  company_id: string;
  company_name?: string;
  period: string;
  declaration_amount: number;
  vat_theoretical_period: number;
  gap: number;
  status: ReconciliationSummary['reconciliation_confidence_score'];
  blocking_controls: number;
  untreated_anomalies: number;
}

export function buildPortfolioSummary(entries: PortfolioEntryInput[]): PortfolioEntry[] {
  return entries.map((e) => {
    const reviewed = new Set(e.adjustments.map((a) => a.lineId));
    const untreated = e.anomalies.filter((a) => !reviewed.has(a.id) || e.adjustments.find((x) => x.lineId === a.id)?.status === 'A_TRAITER').length;

    return {
      company_id: e.company_id,
      company_name: e.company_name,
      period: `${e.period_start} -> ${e.period_end}`,
      declaration_amount: e.summary.declaration_amount,
      vat_theoretical_period: e.summary.vat_theoretical_period,
      gap: e.summary.cadrage_gap_adjusted,
      status: e.summary.reconciliation_confidence_score,
      blocking_controls: e.controls.filter((c) => c.level === 'BLOCKING').length,
      untreated_anomalies: untreated
    };
  });
}
