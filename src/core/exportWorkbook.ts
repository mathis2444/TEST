import * as XLSX from 'xlsx';

function safeExcel(value: unknown) {
  const s = String(value ?? '');
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

function sanitizeRows(rows: any[]) {
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? safeExcel(v) : v])));
}

const LEVEL_ORDER: Record<string, number> = { BLOCKING: 0, WARNING: 1, INFO: 2 };

export function exportWorkbook(payload: {
  summary: any;
  controls: any[];
  source: 'CSV' | 'API';
  limitations: string[];
  mapping: any[];
  rawVat: any[];
  rawTax: any[];
  rawGl: any[];
  anomalies: any[];
  lines: any[];
  adjustments: any[];
  byCategory?: any[];
  byAccount?: any[];
  declarationsRetained?: any[];
  declarationsExcluded?: any[];
  ytd?: { declared_amount_ytd: number; vat_theoretical_ytd: number; cadrage_gap_ytd: number };
  threshold?: number;
}) {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: any[], widths?: number[]) => {
    const ws = XLSX.utils.json_to_sheet(sanitizeRows(rows));
    if (widths?.length) ws['!cols'] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  const threshold = Number(payload.threshold ?? 0);
  const finalStatus = payload.summary.reconciliation_confidence_score;
  const conclusionText = finalStatus === 'FIABLE'
    ? 'Le cadrage TVA ne présente pas d’écart significatif au regard du seuil retenu.'
    : finalStatus === 'A_CONTROLER'
      ? 'Un écart ou des contrôles nécessitent une revue.'
      : 'Le cadrage ne permet pas de conclure sans analyse complémentaire.';

  const sortedControls = [...payload.controls].sort((a, b) => (LEVEL_ORDER[a.level] ?? 99) - (LEVEL_ORDER[b.level] ?? 99));

  const reviewed = payload.adjustments;
  const notProcessed = reviewed.filter((a) => a.status === 'A_TRAITER').length;
  const validated = reviewed.filter((a) => a.status === 'VALIDEE').length;
  const blockingCodes = sortedControls.filter((c) => c.level === 'BLOCKING').map((c) => c.code).join(', ') || 'Aucun';
  const comments = reviewed.map((a) => a.comment).filter(Boolean).join(' | ') || 'Aucun';

  add('Conclusion', [{
    societe: payload.summary.company_name || payload.summary.company_id,
    periode: `${payload.summary.period_start} -> ${payload.summary.period_end}`,
    regime_tva: payload.summary.regime_tva,
    tva_declaree: payload.summary.declaration_amount,
    tva_theorique: payload.summary.vat_theoretical_period,
    ecart: payload.summary.cadrage_gap_adjusted,
    seuil: threshold,
    statut_final: finalStatus,
    conclusion: conclusionText
  }], [22, 24, 16, 14, 14, 12, 10, 16, 70]);

  add('Supervision', [{
    controles_bloquants: blockingCodes,
    anomalies_non_traitees: notProcessed,
    anomalies_validees: validated,
    commentaires: comments
  }], [40, 20, 20, 70]);

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
    controles_bloquants: blockingCodes
  }], [16, 24, 10, 26, 14, 20, 16, 12, 12, 16, 40, 40]);

  add('Summary', [payload.summary], [20, 18, 14, 14, 14, 16, 16, 16, 16, 16, 16, 16, 14, 18, 18, 18]);
  if (payload.ytd) add('YTD', [payload.ytd], [20, 20, 20]);
  add('Controls', sortedControls, [32, 12, 40, 40, 16]);
  add('Adjustments', payload.adjustments, [26, 24, 20, 18, 20, 40, 14, 14]);

  const anomalyReview = payload.anomalies.map((a) => {
    const rev = payload.adjustments.find((x) => x.lineId === a.id) ?? {};
    return {
      ...a,
      review_status: rev.status ?? 'A_TRAITER',
      review_action: rev.action ?? '',
      review_comment: rev.comment ?? '',
      review_author: rev.author ?? '',
      review_date: rev.reviewDate ?? rev.timestamp ?? ''
    };
  });
  add('AnomaliesReview', anomalyReview, [32, 28, 16, 16, 20, 24, 16, 16, 24]);

  if (payload.byCategory) add('ByCategory', payload.byCategory, [24, 14]);
  if (payload.byAccount) add('ByAccount445', payload.byAccount, [16, 24, 14, 14, 14]);
  if (payload.declarationsRetained) add('DeclarationsRetained', payload.declarationsRetained);
  if (payload.declarationsExcluded) add('DeclarationsExcluded', payload.declarationsExcluded);
  add('MappingUsed', payload.mapping);
  add('RawVatDeclarations', payload.rawVat);
  add('RawTaxDeclarations', payload.rawTax);
  add('RawGeneralLedger', payload.rawGl);
  add('Anomalies', payload.anomalies);
  add('ClassifiedLines', payload.lines);
  return wb;
}
