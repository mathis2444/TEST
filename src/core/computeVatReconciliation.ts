import { dt, overlapsPeriod } from './parseDates';
import { num } from './parseAmounts';
import { classifyVatLines } from './classifyVatLines';
import { detectAnomalies } from './detectAnomalies';
import { applyAdjustments } from './applyAdjustments';
import type { Adjustment, Control, RegimeTva, ReconciliationSummary } from '../types';

const CALC_CATEGORIES = ['COLLECTEE', 'DED_ABS', 'DED_IMMO', 'DUE_AUTOLIQ', 'DED_AUTOLIQ', 'CREDIT_ANTERIEUR', 'REGULARISATION_TVA'];
const EXPLANATION_CATEGORIES = ['TVA_A_DECAISSER', 'TVA_FACTURES_NON_PARVENUES', 'TVA_FACTURES_A_ETABLIR'];
const PLUS = new Set(['COLLECTEE', 'DUE_AUTOLIQ', 'REGULARISATION_TVA']);

const parseBool = (v: unknown) => v === true || String(v).trim().toLowerCase() === 'true';

function groupByCategory(lines: any[]) {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.vat_category, (m.get(l.vat_category) ?? 0) + l.normalized_amount);
  return m;
}

function groupByAccount(lines: any[]) {
  const m = new Map<string, { account_number: string; account_label: string; debit: number; credit: number; net: number }>();
  for (const l of lines) {
    const key = l.account_number;
    const curr = m.get(key) ?? { account_number: key, account_label: l.account_label ?? '', debit: 0, credit: 0, net: 0 };
    curr.debit += l.debit;
    curr.credit += l.credit;
    curr.net += l.net_amount;
    m.set(key, curr);
  }
  return [...m.values()];
}

function calcFromCategories(totals: Map<string, number>) {
  let out = 0;
  for (const c of CALC_CATEGORIES) {
    const v = totals.get(c) ?? 0;
    out += PLUS.has(c) ? v : -v;
  }
  return out;
}

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

  const allVatRows = params.vatDeclarations.filter((r) => String(r[params.keysVat.company ?? ''] ?? '') === params.companyId);

  const vatRows = allVatRows.filter((r) => {
    const s = dt(r[params.keysVat.periodStart ?? '']);
    const e = dt(r[params.keysVat.periodEnd ?? '']);
    return overlapsPeriod(s, e, ps, pe);
  });

  const vatRowsYtd = allVatRows.filter((r) => {
    const s = dt(r[params.keysVat.periodStart ?? '']) ?? fs;
    const e = dt(r[params.keysVat.periodEnd ?? '']) ?? s;
    return e >= fs && s <= pe;
  });

  const declarationAmount = vatRows.reduce((a, r) => a + num(r[params.keysVat.declared ?? '']), 0);
  const declarationAmountYtd = vatRowsYtd.reduce((a, r) => a + num(r[params.keysVat.declared ?? '']), 0);
  const form = String(vatRows[0]?.[params.keysVat.form ?? ''] ?? '3310CA3');

  const frequency = String(vatRows[0]?.vat_frequency ?? '').toLowerCase();

  const taxRowsAll = params.taxDeclarations
    .filter((r) => String(r.company_id ?? '') === params.companyId)
    .filter((r) => String(r.declaration_type ?? '').toUpperCase() === 'TVA');

  const taxRows = taxRowsAll.filter((r) => {
    const s = dt(r.declaration_period_start_at);
    const e = dt(r.declaration_period_end_at);
    return overlapsPeriod(s, e, ps, pe);
  });

  const latestTax = taxRows[taxRows.length - 1] ?? {};

  const allLines = classifyVatLines(
    params.generalLedger.filter((g) => String(g[params.keysGl.company ?? ''] ?? '') === params.companyId),
    params.keysGl,
    params.mapping as any,
    params.companyId
  );

  const lines = allLines.filter((l) => {
    const d = dt(l.entry_date);
    return d && d >= ps && d <= pe;
  });

  const linesYtd = allLines.filter((l) => {
    const d = dt(l.entry_date);
    return d && d >= fs && d <= pe;
  });

  const categoryTotals = groupByCategory(lines);
  const categoryTotalsYtd = groupByCategory(linesYtd);
  const accountTotals = groupByAccount(lines);

  const vatTheoretical = calcFromCategories(categoryTotals);
  const vatTheoreticalYtd = calcFromCategories(categoryTotalsYtd);

  const anomalies = detectAnomalies(lines);
  const autoliqDelta = Math.abs((categoryTotals.get('DUE_AUTOLIQ') ?? 0) - (categoryTotals.get('DED_AUTOLIQ') ?? 0));

  const controls: Control[] = [];
  if (!vatRows.length) controls.push({ code: 'TVA_DECLARATION_NOT_FOUND', level: 'BLOCKING', message: 'Aucune déclaration TVA sur la période', action: 'Vérifier dépôt', impact: 'NON_CONCLUANT' });

  const expectedRows = allVatRows.filter((r) => parseBool(r.is_expected));
  const doneRows = expectedRows.filter((r) => ['done', 'sent', 'accepted', 'paid'].includes(String(r.status ?? '').toLowerCase()));
  if (expectedRows.length > 0 && doneRows.length === 0) controls.push({ code: 'DECLARATION_EXPECTED_NOT_DONE', level: 'BLOCKING', message: 'Déclaration attendue non faite', action: 'Produire/déposer', impact: 'NON_CONCLUANT' });

  if (frequency.includes('quarter') && ps.getMonth() === pe.getMonth()) {
    controls.push({ code: 'PERIOD_FREQUENCY_MISMATCH', level: 'WARNING', message: 'Période mensuelle sélectionnée pour fréquence trimestrielle', action: 'Sélectionner trimestre complet', impact: 'A_CONTROLER' });
  }

  if (String(latestTax.declaration_status ?? '').toUpperCase() && !/ACCEPT|VALID|SUBMIT/.test(String(latestTax.declaration_status).toUpperCase())) {
    controls.push({ code: 'DECLARATION_NOT_ACCEPTED', level: 'WARNING', message: 'Déclaration non acceptée', action: 'Contrôler statut fiscal', impact: 'A_CONTROLER' });
  }

  if (!parseBool(latestTax.is_payment_validated)) {
    controls.push({ code: 'PAYMENT_NOT_VALIDATED', level: 'WARNING', message: 'Paiement non validé', action: 'Contrôler règlement', impact: 'A_CONTROLER' });
  }

  const unmappedAbs = anomalies.filter((a) => a.anomaly_code === 'UNMAPPED_445_SIGNIFICANT').reduce((a, b) => a + Math.abs(b.net_amount), 0);
  if (unmappedAbs >= params.threshold) {
    controls.push({ code: 'UNMAPPED_445_SIGNIFICANT', level: 'BLOCKING', message: 'Comptes 445 non mappés significatifs', action: 'Compléter mapping', impact: 'NON_CONCLUANT' });
  } else if (unmappedAbs > 0) {
    controls.push({ code: 'UNMAPPED_445_MINOR', level: 'INFO', message: 'Comptes 445 non mappés non significatifs', action: 'Finaliser mapping', impact: 'A_CONTROLER' });
  }

  if (anomalies.some((a) => a.anomaly_code === 'TVA_COLLECTEE_DEBIT')) {
    controls.push({ code: 'TVA_COLLECTEE_DEBIT', level: 'WARNING', message: 'TVA collectée au débit détectée', action: 'Vérifier et corriger le sens de comptabilisation', impact: 'A_CONTROLER' });
  }

  if (anomalies.some((a) => a.anomaly_code === 'TVA_DEDUCTIBLE_CREDIT')) {
    controls.push({ code: 'TVA_DEDUCTIBLE_CREDIT', level: 'WARNING', message: 'TVA déductible au crédit détectée', action: 'Vérifier et corriger le sens de comptabilisation', impact: 'A_CONTROLER' });
  }

  if (autoliqDelta > 1) controls.push({ code: 'AUTOLIQ_NOT_BALANCED', level: 'WARNING', message: 'Autoliquidation non équilibrée', action: 'Vérifier DUE/DED', impact: 'A_CONTROLER' });
  if ((categoryTotals.get('CREDIT_ANTERIEUR') ?? 0) === 0 && lines.some((l) => l.account_number.startsWith('44567'))) controls.push({ code: 'CREDIT_ANTERIEUR_NOT_EXPLAINED', level: 'WARNING', message: '44567 sans explication crédit antérieur', action: 'Qualifier 44567', impact: 'A_CONTROLER' });
  if (lines.some((l) => l.account_number.startsWith('44551')) && !vatRows.length) controls.push({ code: '44551_MOVEMENT_WITHOUT_DECLARATION', level: 'WARNING', message: '44551 mouvementé sans déclaration', action: 'Vérifier la déclaration TVA de la période', impact: 'A_CONTROLER' });
  if (anomalies.some((a) => a.anomaly_code === 'OD_TVA_SIGNIFICATIVE')) controls.push({ code: 'OD_TVA_SIGNIFICATIVE', level: 'WARNING', message: 'OD TVA significative', action: 'Contrôler justificatifs', impact: 'A_CONTROLER' });
  if (anomalies.some((a) => a.anomaly_code === 'MISSING_DOCUMENT_SIGNIFICANT')) controls.push({ code: 'MISSING_DOCUMENT_SIGNIFICANT', level: 'WARNING', message: 'Absence de document sur ligne significative', action: 'Rattacher une pièce justificative', impact: 'A_CONTROLER' });
  if (anomalies.some((a) => a.anomaly_code === 'NO_INVOICE_REFERENCE')) controls.push({ code: 'NO_INVOICE_REFERENCE', level: 'INFO', message: 'Référence facture absente', action: 'Compléter invoice', impact: 'A_CONTROLER' });
  if (fs > ps) controls.push({ code: 'PERIOD_OUTSIDE_FISCAL_YEAR', level: 'BLOCKING', message: 'Période hors exercice', action: 'Corriger dates', impact: 'NON_CONCLUANT' });
  if (params.regimeTva === 'marge') controls.push({ code: 'VAT_MARGIN_SCOPE_NOT_HANDLED', level: 'BLOCKING', message: 'TVA marge non couverte', action: 'Traitement complémentaire', impact: 'NON_CONCLUANT' });
  if (params.regimeTva === 'encaissements') controls.push({ code: 'CASH_BASIS_SCOPE_NOT_HANDLED', level: 'BLOCKING', message: 'TVA encaissements non couverte', action: 'Traitement complémentaire', impact: 'NON_CONCLUANT' });

  const adjustedTheoretical = applyAdjustments(vatTheoretical, anomalies, params.adjustments);
  const gap = declarationAmount - vatTheoretical;
  const gapAdjusted = declarationAmount - adjustedTheoretical;

  const numericGapStatus: 'OK' | 'A_CONTROLER' = Math.abs(gapAdjusted) <= params.threshold ? 'OK' : 'A_CONTROLER';
  const hasBlocking = controls.some((c) => c.level === 'BLOCKING');
  const reconciliationStatus: ReconciliationSummary['reconciliation_confidence_score'] =
    hasBlocking || ['encaissements', 'marge'].includes(params.regimeTva) ? 'NON_CONCLUANT' :
    numericGapStatus === 'OK' && controls.length === 0 ? 'FIABLE' : 'A_CONTROLER';

  const summary: ReconciliationSummary = {
    company_id: params.companyId,
    company_name: params.companyName,
    period_start: params.selectedPeriodStart,
    period_end: params.selectedPeriodEnd,
    fiscal_year_start: params.fiscalYearStart,
    regime_tva: params.regimeTva,
    declaration_form_name: form || '3310CA3',
    declaration_amount: declarationAmount,
    payment_amount: num(latestTax.payment_amount),
    vat_theoretical_period: vatTheoretical,
    cadrage_gap_period: gap,
    cadrage_gap_adjusted: gapAdjusted,
    gap_status: numericGapStatus,
    tax_declaration_status: String(latestTax.declaration_status ?? 'UNKNOWN'),
    is_declaration_validated: parseBool(latestTax.is_declaration_validated),
    is_payment_validated: parseBool(latestTax.is_payment_validated),
    reconciliation_confidence_score: reconciliationStatus
  };

  return {
    summary,
    lines,
    anomalies,
    controls,
    categoryTotals,
    categoryTotalsYtd,
    accountTotals,
    declarationAmountYtd,
    vatTheoreticalYtd,
    cadrageGapYtd: declarationAmountYtd - vatTheoreticalYtd,
    explanations: [...categoryTotals.entries()].filter(([k]) => EXPLANATION_CATEGORIES.includes(k)).map(([vat_category, amount]) => ({ vat_category, amount })),
    declarationsRetained: vatRows,
    declarationsExcluded: allVatRows.filter((r) => !vatRows.includes(r)),
    numeric_gap_status: numericGapStatus,
    reconciliation_status: reconciliationStatus
  };
}
