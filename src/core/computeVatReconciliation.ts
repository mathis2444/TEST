import { dt, overlapsPeriod } from './parseDates';
import { num } from './parseAmounts';
import { classifyVatLines } from './classifyVatLines';
import { detectAnomalies } from './detectAnomalies';
import { applyAdjustments } from './applyAdjustments';
import type { Adjustment, Control, RegimeTva, ReconciliationSummary } from '../types';

const CALC_CATEGORIES = ['COLLECTEE', 'DED_ABS', 'DED_IMMO', 'DUE_AUTOLIQ', 'DED_AUTOLIQ', 'CREDIT_ANTERIEUR', 'REGULARISATION_TVA'];
const PLUS = new Set(['COLLECTEE', 'DUE_AUTOLIQ', 'REGULARISATION_TVA']);

export function computeVatReconciliation(params: {
  companyId: string;
  companyName?: string;
  vatDeclarations: Record<string, unknown>[];
  taxDeclarations: Record<string, unknown>[];
  generalLedger: Record<string, unknown>[];
  mapping: any[];
  selectedPeriodStart: string;
  selectedPeriodEnd: string;
  fiscalYearStart: string;
  regimeTva: RegimeTva;
  threshold: number;
  keysVat: Record<string, string | null>;
  keysGl: Record<string, string | null>;
  adjustments: Adjustment[];
}) {
  const ps = dt(params.selectedPeriodStart)!;
  const pe = dt(params.selectedPeriodEnd)!;
  const fs = dt(params.fiscalYearStart)!;

  const vatRows = params.vatDeclarations.filter((r) => {
    const s = dt(r[params.keysVat.periodStart ?? '']);
    const e = dt(r[params.keysVat.periodEnd ?? '']);
    return String(r[params.keysVat.company ?? ''] ?? '') === params.companyId && overlapsPeriod(s, e, ps, pe);
  });

  const declAmount = vatRows.reduce((a, r) => a + num(r[params.keysVat.declared ?? '']), 0);
  const form = String(vatRows[0]?.[params.keysVat.form ?? ''] ?? '3310CA3');

  const taxRows = params.taxDeclarations
    .filter((r) => String(r.company_id ?? '') === params.companyId)
    .filter((r) => String(r.declaration_type ?? '').toUpperCase() === 'TVA');

  const latestTax = taxRows[taxRows.length - 1] ?? {};

  const lines = classifyVatLines(params.generalLedger.filter((g) => String(g[params.keysGl.company ?? ''] ?? '') === params.companyId), params.keysGl, params.mapping as any, params.companyId)
    .filter((l) => {
      const d = dt(l.entry_date);
      return d && d >= ps && d <= pe;
    });

  const categoryTotals = new Map<string, number>();
  for (const l of lines) categoryTotals.set(l.vat_category, (categoryTotals.get(l.vat_category) ?? 0) + l.normalized_amount);

  let vatTheoretical = 0;
  for (const c of CALC_CATEGORIES) {
    if (c === 'TVA_A_DECAISSER') continue;
    const v = categoryTotals.get(c) ?? 0;
    vatTheoretical += PLUS.has(c) ? v : -v;
  }

  const anomalies = detectAnomalies(lines);
  const autoliqDelta = Math.abs((categoryTotals.get('DUE_AUTOLIQ') ?? 0) - (categoryTotals.get('DED_AUTOLIQ') ?? 0));

  const controls: Control[] = [];
  if (!vatRows.length) controls.push({ code: 'TVA_DECLARATION_NOT_FOUND', level: 'BLOCKING', message: 'Aucune déclaration TVA sur la période', action: 'Vérifier dépôt', impact: 'NON_CONCLUANT' });
  if (vatRows.some((x) => x.is_expected === true) && !vatRows.length) controls.push({ code: 'DECLARATION_EXPECTED_NOT_DONE', level: 'BLOCKING', message: 'Déclaration attendue non faite', action: 'Produire/déposer', impact: 'NON_CONCLUANT' });
  if (String(latestTax.declaration_status ?? '').toUpperCase() && !/ACCEPT|VALID|SUBMIT/.test(String(latestTax.declaration_status).toUpperCase())) controls.push({ code: 'DECLARATION_NOT_ACCEPTED', level: 'WARNING', message: 'Déclaration non acceptée', action: 'Contrôler statut fiscal', impact: 'A_CONTROLER' });
  if (latestTax.is_payment_validated === false) controls.push({ code: 'PAYMENT_NOT_VALIDATED', level: 'WARNING', message: 'Paiement non validé', action: 'Contrôler règlement', impact: 'A_CONTROLER' });
  if (anomalies.some((a) => a.anomaly_code === 'UNMAPPED_445_SIGNIFICANT')) controls.push({ code: 'UNMAPPED_445_SIGNIFICANT', level: 'BLOCKING', message: 'Comptes 445 non mappés significatifs', action: 'Compléter mapping', impact: 'NON_CONCLUANT' });
  if (autoliqDelta > 1) controls.push({ code: 'AUTOLIQ_NOT_BALANCED', level: 'WARNING', message: 'Autoliquidation non équilibrée', action: 'Vérifier DUE/DED', impact: 'A_CONTROLER' });
  if ((categoryTotals.get('CREDIT_ANTERIEUR') ?? 0) === 0 && String(lines.find((l) => l.account_number.startsWith('44567')))) controls.push({ code: 'CREDIT_ANTERIEUR_NOT_EXPLAINED', level: 'WARNING', message: '44567 sans explication crédit antérieur', action: 'Qualifier 44567', impact: 'A_CONTROLER' });
  if ((categoryTotals.get('TVA_A_DECAISSER') ?? 0) !== 0 && !vatRows.length) controls.push({ code: '44551_MOVEMENT_WITHOUT_DECLARATION', level: 'WARNING', message: '44551 mouvement sans déclaration', action: 'Analyser règlements', impact: 'A_CONTROLER' });
  if (anomalies.some((a) => a.anomaly_code === 'OD_TVA_SIGNIFICATIVE')) controls.push({ code: 'OD_TVA_SIGNIFICATIVE', level: 'WARNING', message: 'OD TVA significative', action: 'Contrôler justificatifs', impact: 'A_CONTROLER' });
  if (anomalies.some((a) => a.anomaly_code === 'NO_DOCUMENT_REFERENCE')) controls.push({ code: 'NO_DOCUMENT_REFERENCE', level: 'WARNING', message: 'Référence document absente', action: 'Compléter pièces', impact: 'A_CONTROLER' });
  if (anomalies.some((a) => a.anomaly_code === 'NO_INVOICE_REFERENCE')) controls.push({ code: 'NO_INVOICE_REFERENCE', level: 'INFO', message: 'Référence facture absente', action: 'Compléter invoice', impact: 'A_CONTROLER' });
  if (fs > ps) controls.push({ code: 'PERIOD_OUTSIDE_FISCAL_YEAR', level: 'BLOCKING', message: 'Période hors exercice', action: 'Corriger dates', impact: 'NON_CONCLUANT' });
  if (params.regimeTva === 'marge') controls.push({ code: 'VAT_MARGIN_SCOPE_NOT_HANDLED', level: 'BLOCKING', message: 'TVA marge non couverte', action: 'Traitement complémentaire', impact: 'NON_CONCLUANT' });
  if (params.regimeTva === 'encaissements') controls.push({ code: 'CASH_BASIS_SCOPE_NOT_HANDLED', level: 'BLOCKING', message: 'TVA encaissements non couverte', action: 'Traitement complémentaire', impact: 'NON_CONCLUANT' });

  const adjusted = applyAdjustments(vatTheoretical, anomalies, params.adjustments);
  const gap = declAmount - vatTheoretical;
  const gapAdjusted = declAmount - adjusted;

  const hasBlocking = controls.some((c) => c.level === 'BLOCKING');
  const confidence: ReconciliationSummary['reconciliation_confidence_score'] =
    hasBlocking || ['encaissements', 'marge'].includes(params.regimeTva) ? 'NON_CONCLUANT' :
    Math.abs(gapAdjusted) <= params.threshold && controls.length === 0 ? 'FIABLE' : 'A_CONTROLER';

  const summary: ReconciliationSummary = {
    company_id: params.companyId,
    company_name: params.companyName,
    period_start: params.selectedPeriodStart,
    period_end: params.selectedPeriodEnd,
    fiscal_year_start: params.fiscalYearStart,
    regime_tva: params.regimeTva,
    declaration_form_name: form || '3310CA3',
    declaration_amount: declAmount,
    payment_amount: num(latestTax.payment_amount),
    vat_theoretical_period: vatTheoretical,
    cadrage_gap_period: gap,
    cadrage_gap_adjusted: gapAdjusted,
    gap_status: Math.abs(gapAdjusted) <= params.threshold ? 'OK' : 'A_CONTROLER',
    tax_declaration_status: String(latestTax.declaration_status ?? 'UNKNOWN'),
    is_declaration_validated: Boolean(latestTax.is_declaration_validated),
    is_payment_validated: Boolean(latestTax.is_payment_validated),
    reconciliation_confidence_score: confidence
  };

  return { summary, lines, anomalies, controls, categoryTotals };
}
