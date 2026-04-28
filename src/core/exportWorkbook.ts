import * as XLSX from 'xlsx';
import type { Control, ReconciliationSummary } from '../types';

export function exportWorkbook(payload: {
  summary: ReconciliationSummary;
  controls: Control[];
  source: 'CSV' | 'API';
  limitations: string[];
  mapping: any[];
  rawVat: any[];
  rawTax: any[];
  rawGl: any[];
  anomalies: any[];
  lines: any[];
  adjustments: any[];
}) {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: any[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);

  add('README_CONTROLE', [{
    societe: payload.summary.company_id,
    periode: `${payload.summary.period_start} -> ${payload.summary.period_end}`,
    source: payload.source,
    date_extraction: new Date().toISOString(),
    regime_tva: payload.summary.regime_tva,
    statut_declaration: payload.summary.tax_declaration_status,
    statut_paiement: payload.summary.is_payment_validated,
    ecart_brut: payload.summary.cadrage_gap_period,
    ecart_ajuste: payload.summary.cadrage_gap_adjusted,
    niveau_fiabilite: payload.summary.reconciliation_confidence_score,
    limitations: payload.limitations.join('; '),
    controles_bloquants: payload.controls.filter((c) => c.level === 'BLOCKING').map((c) => c.code).join(', ')
  }]);

  add('Summary', [payload.summary]);
  add('Controls', payload.controls);
  add('Adjustments', payload.adjustments);
  add('MappingUsed', payload.mapping);
  add('RawVatDeclarations', payload.rawVat);
  add('RawTaxDeclarations', payload.rawTax);
  add('RawGeneralLedger', payload.rawGl);
  add('Anomalies', payload.anomalies);
  add('ClassifiedLines', payload.lines);
  return wb;
}
