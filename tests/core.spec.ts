import { describe, it, expect } from 'vitest';
import { num } from '../src/core/parseAmounts';
import { dt } from '../src/core/parseDates';
import { computeVatReconciliation } from '../src/core/computeVatReconciliation';
import { classifyVatLines } from '../src/core/classifyVatLines';
import { aliases, normalizeColumns } from '../src/core/normalizeColumns';
import { buildCabinetConclusion, conclusionMessage } from '../src/core/buildCabinetConclusion';
import { applyAdjustments } from '../src/core/applyAdjustments';
import { exportWorkbook } from '../src/core/exportWorkbook';
import { buildPortfolioSummary } from '../src/core/buildPortfolioSummary';
import fs from 'node:fs';
import Papa from 'papaparse';

function csv(path: string) {
  return Papa.parse(fs.readFileSync(path, 'utf8'), { header: true, skipEmptyLines: true }).data as Record<string, unknown>[];
}

const vat = csv('tests/sample_vat_declarations.csv');
const tax = csv('tests/sample_tax_declarations.csv');
const gl = csv('tests/sample_general_ledger.csv');
const mapping = csv('tests/sample_mapping.csv') as any[];
const keysVat = normalizeColumns(vat[0], aliases);
const keysGl = normalizeColumns(gl[0], aliases);


function makeSummary(overrides: Partial<Parameters<typeof buildCabinetConclusion>[0]> = {}) {
  return {
    company_id: 'C1',
    company_name: 'Cabinet Demo',
    period_start: '2026-01-01',
    period_end: '2026-01-31',
    fiscal_year_start: '2026-01-01',
    regime_tva: 'debits',
    declaration_form_name: '3310CA3',
    declaration_amount: 100,
    payment_amount: 100,
    vat_theoretical_period: 100,
    cadrage_gap_period: 0,
    cadrage_gap_adjusted: 0,
    gap_status: 'OK',
    tax_declaration_status: 'ACCEPTED',
    is_declaration_validated: true,
    is_payment_validated: true,
    reconciliation_confidence_score: 'FIABLE',
    ...overrides
  } as any;
}

describe('parsers', () => {
  it('parse FR amount', () => {
    expect(num('1 234,56')).toBe(1234.56);
    expect(num('(1 234,56)')).toBe(-1234.56);
    expect(num('1 234,56 €')).toBe(1234.56);
  });

  it('parse FR date', () => {
    expect(dt('31/01/2026')?.toISOString().slice(0, 10)).toBe('2026-01-31');
  });
});

describe('non regression', () => {
  it('expected summary baseline', () => {
    const expected = JSON.parse(fs.readFileSync('tests/expected_summary.json', 'utf8'));
    const result = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'debits', threshold:5, keysVat, keysGl, adjustments:[] });
    expect(Math.round(result.summary.vat_theoretical_period)).toBe(expected.vat_theoretical_period);
    expect(Math.round(result.summary.cadrage_gap_period)).toBe(expected.cadrage_gap_period);
    expect(result.controls.map(c => c.code)).toContain('UNMAPPED_445_SIGNIFICANT');
  });

  it('tax rows non TVA ignored', () => {
    const result = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'debits', threshold:5, keysVat, keysGl, adjustments:[] });
    expect(result.summary.tax_declaration_status).toBe('ACCEPTED');
  });

  it('string false bool parsed correctly', () => {
    const tax2 = [{ ...tax[0], is_payment_validated: 'false', is_declaration_validated: 'false' } as any];
    const result = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax2, generalLedger:gl, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'debits', threshold:5, keysVat, keysGl, adjustments:[] });
    expect(result.summary.is_payment_validated).toBe(false);
    expect(result.summary.is_declaration_validated).toBe(false);
  });

  it('autoliq balanced not flagged', () => {
    const gl2 = [...gl, { company_id:'C1', date:'31/01/2026', plan_item_number:'4452', debit:'0', credit:'100', journal_code:'OD', id:'A1', document_id:'A1', invoice_number:'' }, { company_id:'C1', date:'31/01/2026', plan_item_number:'445662', debit:'100', credit:'0', journal_code:'OD', id:'A2', document_id:'A2', invoice_number:'' } as any];
    const map2 = [...mapping, { company_id:'__DEFAULT__', account_prefix:'445662', vat_category:'DED_AUTOLIQ', direction:'DEBIT', sign_factor:1, priority:1, is_active:'true' }];
    const keysGl2 = normalizeColumns(gl2[0], aliases);
    const result = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl2, mapping:map2 as any, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'debits', threshold:5, keysVat, keysGl:keysGl2, adjustments:[] });
    expect(result.controls.some(c=>c.code==='AUTOLIQ_NOT_BALANCED')).toBe(false);
  });

  it('autoliq unbalanced flagged', () => {
    const gl2 = [...gl, { company_id:'C1', date:'31/01/2026', plan_item_number:'4452', debit:'0', credit:'300', journal_code:'OD', id:'A3', document_id:'A3', invoice_number:'' } as any];
    const result = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl2, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'debits', threshold:5, keysVat, keysGl, adjustments:[] });
    expect(result.controls.some(c=>c.code==='AUTOLIQ_NOT_BALANCED')).toBe(true);
  });

  it('44551 excluded from theoretical', () => {
    const gl2 = [...gl, { company_id:'C1', date:'31/01/2026', plan_item_number:'44551', debit:'0', credit:'500', journal_code:'OD', id:'X1', document_id:'X1', invoice_number:'' } as any];
    const keysGl2 = normalizeColumns(gl2[0], aliases);
    const r1 = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'debits', threshold:5, keysVat, keysGl, adjustments:[] });
    const r2 = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl2, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'debits', threshold:5, keysVat, keysGl:keysGl2, adjustments:[] });
    expect(r1.summary.vat_theoretical_period).toBe(r2.summary.vat_theoretical_period);
  });

  it('cash/marge non concluant', () => {
    const r = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'encaissements', threshold:5, keysVat, keysGl, adjustments:[] });
    expect(r.summary.reconciliation_confidence_score).toBe('NON_CONCLUANT');
  });

  it('html malicious does not break engine', () => {
    const gl2 = [...gl, { company_id:'C1', date:'31/01/2026', plan_item_number:'44599', debit:'1', credit:'0', journal_code:'OD', document_id:'<img src=x>', invoice_number:'=SUM(1,1)', id:'M1' } as any];
    const r = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl2, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'debits', threshold:5, keysVat, keysGl, adjustments:[] });
    expect(r.anomalies.length).toBeGreaterThan(0);
  });
});


describe('cabinet conclusion', () => {
  it('uses professional message for each status', () => {
    expect(conclusionMessage('FIABLE')).toBe('Le cadrage TVA ne présente pas d’écart significatif au regard du seuil retenu.');
    expect(conclusionMessage('A_CONTROLER')).toBe('Un écart ou des contrôles nécessitent une revue.');
    expect(conclusionMessage('NON_CONCLUANT')).toBe('Le cadrage ne permet pas de conclure sans analyse complémentaire.');
  });


  it('keeps debits final status from reconciliation result (FIABLE)', () => {
    const conclusion = buildCabinetConclusion(makeSummary({ regime_tva: 'debits', reconciliation_confidence_score: 'FIABLE' }), 5, []);
    expect(conclusion.finalStatus).toBe('FIABLE');
  });

  it('keeps debits final status from reconciliation result (A_CONTROLER)', () => {
    const conclusion = buildCabinetConclusion(makeSummary({ regime_tva: 'debits', reconciliation_confidence_score: 'A_CONTROLER' }), 5, []);
    expect(conclusion.finalStatus).toBe('A_CONTROLER');
  });

  it('exposes blocking controls in conclusion', () => {
    const conclusion = buildCabinetConclusion(makeSummary(), 5, [{ code: 'TVA_DECLARATION_NOT_FOUND', level: 'BLOCKING', message: '', action: '', impact: '' }]);
    expect(conclusion.blockingControls).toEqual(['TVA_DECLARATION_NOT_FOUND']);
  });

  it('forces NON_CONCLUANT for encaissements and returns specific alert', () => {
    const base = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'encaissements', threshold:5, keysVat, keysGl, adjustments:[] });
    const conclusion = buildCabinetConclusion(base.summary, 5);
    expect(conclusion.finalStatus).toBe('NON_CONCLUANT');
    expect(conclusion.regimeAlert).toContain('encaissements');
  });

  it('forces NON_CONCLUANT for marge and returns specific alert', () => {
    const base = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'marge', threshold:5, keysVat, keysGl, adjustments:[] });
    const conclusion = buildCabinetConclusion(base.summary, 5);
    expect(conclusion.finalStatus).toBe('NON_CONCLUANT');
    expect(conclusion.regimeAlert).toContain('marge');
  });
});


describe('classifyVatLines mapping priority', () => {
  it('prefers company-specific mapping over __DEFAULT__ for same prefix/priority', () => {
    const rows = [
      { company_id: 'C1', date: '2026-01-15', plan_item_number: '445710', debit: '0', credit: '100', id: 'L1', document_id: 'D1', invoice_number: 'I1' }
    ] as any[];
    const keys = normalizeColumns(rows[0], aliases);
    const map = [
      { company_id: '__DEFAULT__', account_prefix: '4457', vat_category: 'COLLECTEE', direction: 'CREDIT', sign_factor: 1, priority: 10, is_active: 'true' },
      { company_id: 'C1', account_prefix: '4457', vat_category: 'DED_ABS', direction: 'CREDIT', sign_factor: 1, priority: 10, is_active: 'true' }
    ] as any[];

    const lines = classifyVatLines(rows, keys, map, 'C1');
    expect(lines[0].vat_category).toBe('DED_ABS');
    expect(lines[0].mapped).toBe(true);
  });
});

describe('business controls coverage', () => {
  const baseParams = {
    companyId: 'C1',
    vatDeclarations: vat,
    taxDeclarations: tax,
    generalLedger: gl,
    mapping,
    selectedPeriodStart: '2026-01-01',
    selectedPeriodEnd: '2026-01-31',
    fiscalYearStart: '2026-01-01',
    regimeTva: 'debits' as const,
    threshold: 5,
    keysVat,
    keysGl,
    adjustments: []
  };

  it('flags 44551 movement without declaration and does not flag when declaration exists', () => {
    const gl2 = [...gl, { company_id:'C1', date:'31/01/2026', plan_item_number:'44551', debit:'0', credit:'800', journal_code:'OD', id:'B1', document_id:'B1', invoice_number:'INV-B1' } as any];
    const keysGl2 = normalizeColumns(gl2[0], aliases);

    const noDeclaration = computeVatReconciliation({ ...baseParams, vatDeclarations: [], generalLedger: gl2, keysGl: keysGl2 });
    expect(noDeclaration.controls.some((c) => c.code === '44551_MOVEMENT_WITHOUT_DECLARATION')).toBe(true);

    const withDeclaration = computeVatReconciliation({ ...baseParams, generalLedger: gl2, keysGl: keysGl2 });
    expect(withDeclaration.controls.some((c) => c.code === '44551_MOVEMENT_WITHOUT_DECLARATION')).toBe(false);
  });

  it('flags 44567 without credit antérieur and does not flag when credit antérieur is mapped', () => {
    const gl2 = [...gl, { company_id:'C1', date:'31/01/2026', plan_item_number:'44567', debit:'0', credit:'120', journal_code:'OD', id:'B2', document_id:'B2', invoice_number:'INV-B2' } as any];
    const keysGl2 = normalizeColumns(gl2[0], aliases);

    const mapNoCredit = mapping.filter((m:any) => String(m.account_prefix ?? '') !== '44567');
    const noCredit = computeVatReconciliation({ ...baseParams, generalLedger: gl2, keysGl: keysGl2, mapping: mapNoCredit });
    expect(noCredit.controls.some((c) => c.code === 'CREDIT_ANTERIEUR_NOT_EXPLAINED')).toBe(true);

    const map2 = [...mapping, { company_id:'__DEFAULT__', account_prefix:'44567', vat_category:'CREDIT_ANTERIEUR', direction:'CREDIT', sign_factor:1, priority:1, is_active:'true' } as any];
    const withCredit = computeVatReconciliation({ ...baseParams, generalLedger: gl2, keysGl: keysGl2, mapping: map2 });
    expect(withCredit.controls.some((c) => c.code === 'CREDIT_ANTERIEUR_NOT_EXPLAINED')).toBe(false);
  });

  it('flags collected VAT on debit and not when direction is correct', () => {
    const glBad = [{ company_id:'C1', date:'31/01/2026', plan_item_number:'44571', debit:'300', credit:'0', journal_code:'VE', id:'C1', document_id:'C1', invoice_number:'INV-C1' } as any];
    const glGood = [{ company_id:'C1', date:'31/01/2026', plan_item_number:'44571', debit:'0', credit:'300', journal_code:'VE', id:'C2', document_id:'C2', invoice_number:'INV-C2' } as any];
    const mapOnly = [{ company_id:'__DEFAULT__', account_prefix:'44571', vat_category:'COLLECTEE', direction:'NET', sign_factor:1, priority:1, is_active:'true' } as any];

    const bad = computeVatReconciliation({ ...baseParams, generalLedger: glBad, mapping: mapOnly, keysGl: normalizeColumns(glBad[0], aliases) });
    expect(bad.controls.some((c) => c.code === 'TVA_COLLECTEE_DEBIT')).toBe(true);

    const good = computeVatReconciliation({ ...baseParams, generalLedger: glGood, mapping: mapOnly, keysGl: normalizeColumns(glGood[0], aliases) });
    expect(good.controls.some((c) => c.code === 'TVA_COLLECTEE_DEBIT')).toBe(false);
  });

  it('flags deductible VAT on credit and not when direction is correct', () => {
    const glBad = [{ company_id:'C1', date:'31/01/2026', plan_item_number:'44566', debit:'0', credit:'250', journal_code:'AC', id:'D1', document_id:'D1', invoice_number:'INV-D1' } as any];
    const glGood = [{ company_id:'C1', date:'31/01/2026', plan_item_number:'44566', debit:'250', credit:'0', journal_code:'AC', id:'D2', document_id:'D2', invoice_number:'INV-D2' } as any];
    const mapOnly = [{ company_id:'__DEFAULT__', account_prefix:'44566', vat_category:'DED_ABS', direction:'NET', sign_factor:1, priority:1, is_active:'true' } as any];

    const bad = computeVatReconciliation({ ...baseParams, generalLedger: glBad, mapping: mapOnly, keysGl: normalizeColumns(glBad[0], aliases) });
    expect(bad.controls.some((c) => c.code === 'TVA_DEDUCTIBLE_CREDIT')).toBe(true);

    const good = computeVatReconciliation({ ...baseParams, generalLedger: glGood, mapping: mapOnly, keysGl: normalizeColumns(glGood[0], aliases) });
    expect(good.controls.some((c) => c.code === 'TVA_DEDUCTIBLE_CREDIT')).toBe(false);
  });

  it('flags significant OD and not for non-significant OD', () => {
    const glBad = [{ company_id:'C1', date:'31/01/2026', plan_item_number:'44571', debit:'0', credit:'1500', journal_code:'OD', id:'E1', document_id:'E1', invoice_number:'INV-E1' } as any];
    const glGood = [{ company_id:'C1', date:'31/01/2026', plan_item_number:'44571', debit:'0', credit:'100', journal_code:'OD', id:'E2', document_id:'E2', invoice_number:'INV-E2' } as any];
    const mapOnly = [{ company_id:'__DEFAULT__', account_prefix:'44571', vat_category:'COLLECTEE', direction:'NET', sign_factor:1, priority:1, is_active:'true' } as any];

    const bad = computeVatReconciliation({ ...baseParams, generalLedger: glBad, mapping: mapOnly, keysGl: normalizeColumns(glBad[0], aliases) });
    expect(bad.controls.some((c) => c.code === 'OD_TVA_SIGNIFICATIVE')).toBe(true);

    const good = computeVatReconciliation({ ...baseParams, generalLedger: glGood, mapping: mapOnly, keysGl: normalizeColumns(glGood[0], aliases) });
    expect(good.controls.some((c) => c.code === 'OD_TVA_SIGNIFICATIVE')).toBe(false);
  });

  it('flags missing significant document and not for non-significant line', () => {
    const glBad = [{ company_id:'C1', date:'31/01/2026', plan_item_number:'44571', debit:'0', credit:'700', journal_code:'VE', id:'F1', document_id:'', invoice_number:'INV-F1' } as any];
    const glGood = [{ company_id:'C1', date:'31/01/2026', plan_item_number:'44571', debit:'0', credit:'100', journal_code:'VE', id:'F2', document_id:'', invoice_number:'INV-F2' } as any];
    const mapOnly = [{ company_id:'__DEFAULT__', account_prefix:'44571', vat_category:'COLLECTEE', direction:'NET', sign_factor:1, priority:1, is_active:'true' } as any];

    const bad = computeVatReconciliation({ ...baseParams, generalLedger: glBad, mapping: mapOnly, keysGl: normalizeColumns(glBad[0], aliases) });
    expect(bad.controls.some((c) => c.code === 'MISSING_DOCUMENT_SIGNIFICANT')).toBe(true);

    const good = computeVatReconciliation({ ...baseParams, generalLedger: glGood, mapping: mapOnly, keysGl: normalizeColumns(glGood[0], aliases) });
    expect(good.controls.some((c) => c.code === 'MISSING_DOCUMENT_SIGNIFICANT')).toBe(false);
  });
});


describe('applyAdjustments', () => {
  const anomalies = [{ id: 'L1', normalized_amount: 100, net_amount: 100 }];

  it('applies only VALIDEE adjustments', () => {
    const draft = applyAdjustments(1000, anomalies, [{ lineId: 'L1', action: 'EXCLUDE_LINE', status: 'CORRECTION_PROPOSEE', author: 'u', timestamp: '', comment: '', oldImpact: 0, newImpact: 0 } as any]);
    const validated = applyAdjustments(1000, anomalies, [{ lineId: 'L1', action: 'EXCLUDE_LINE', status: 'VALIDEE', author: 'u', timestamp: '', comment: 'ok', oldImpact: 0, newImpact: 0 } as any]);
    expect(draft).toBe(1000);
    expect(validated).toBe(900);
  });

  it('applies SIGN_INVERT correctly', () => {
    const out = applyAdjustments(1000, anomalies, [{ lineId: 'L1', action: 'SIGN_INVERT', status: 'VALIDEE', author: 'u', timestamp: '', comment: 'ok', oldImpact: 0, newImpact: 0 } as any]);
    expect(out).toBe(800);
  });

  it('ignores adjustment if anomaly line is missing', () => {
    const out = applyAdjustments(1000, anomalies, [{ lineId: 'UNKNOWN', action: 'EXCLUDE_LINE', status: 'VALIDEE', author: 'u', timestamp: '', comment: 'ok', oldImpact: 0, newImpact: 0 } as any]);
    expect(out).toBe(1000);
  });
});


describe('exportWorkbook', () => {
  it('includes key cabinet sheets', () => {
    const wb = exportWorkbook({
      summary: {
        company_id: 'C1', company_name: 'Cabinet Demo', period_start: '2026-01-01', period_end: '2026-01-31', regime_tva: 'debits',
        declaration_amount: 1000, vat_theoretical_period: 995, cadrage_gap_adjusted: 5, cadrage_gap_period: 5,
        tax_declaration_status: 'ACCEPTED', is_payment_validated: true, reconciliation_confidence_score: 'FIABLE'
      },
      controls: [
        { code: 'W1', level: 'WARNING', message: 'warn', action: 'act', impact: 'A_CONTROLER' },
        { code: 'B1', level: 'BLOCKING', message: 'block', action: 'act', impact: 'NON_CONCLUANT' }
      ],
      source: 'CSV',
      limitations: [],
      mapping: [],
      rawVat: [],
      rawTax: [],
      rawGl: [],
      anomalies: [{ id: 'L1' }],
      lines: [],
      adjustments: [{ lineId: 'L1', action: 'EXCLUDE_LINE', status: 'VALIDEE', author: 'chef', timestamp: '2026-01-31', comment: 'ok', oldImpact: 0, newImpact: 0 }],
      threshold: 5
    });

    expect(wb.SheetNames).toContain('Conclusion');
    expect(wb.SheetNames).toContain('Supervision');
    expect(wb.SheetNames).toContain('Controls');
    expect(wb.SheetNames).toContain('AnomaliesReview');
  });

  it('sorts controls by severity in Controls sheet', () => {
    const wb = exportWorkbook({
      summary: { company_id: 'C1', period_start: '2026-01-01', period_end: '2026-01-31', regime_tva: 'debits', declaration_amount: 0, vat_theoretical_period: 0, cadrage_gap_adjusted: 0, cadrage_gap_period: 0, tax_declaration_status: 'ACCEPTED', is_payment_validated: true, reconciliation_confidence_score: 'A_CONTROLER' },
      controls: [
        { code: 'I1', level: 'INFO', message: '', action: '', impact: '' },
        { code: 'W1', level: 'WARNING', message: '', action: '', impact: '' },
        { code: 'B1', level: 'BLOCKING', message: '', action: '', impact: '' }
      ],
      source: 'CSV', limitations: [], mapping: [], rawVat: [], rawTax: [], rawGl: [], anomalies: [], lines: [], adjustments: []
    });

    const controlsSheet = wb.Sheets['Controls'];
    expect(controlsSheet['A2']?.v).toBe('B1');
    expect(controlsSheet['A3']?.v).toBe('W1');
    expect(controlsSheet['A4']?.v).toBe('I1');
  });
});


describe('buildPortfolioSummary', () => {
  it('builds one summary line per dossier with blocking and untreated counts', () => {
    const out = buildPortfolioSummary([
      {
        company_id: 'C1',
        company_name: 'Cabinet Alpha',
        period_start: '2026-01-01',
        period_end: '2026-01-31',
        summary: { declaration_amount: 100, vat_theoretical_period: 90, cadrage_gap_adjusted: 10, reconciliation_confidence_score: 'A_CONTROLER' } as any,
        controls: [{ level: 'BLOCKING' }, { level: 'WARNING' }] as any,
        anomalies: [{ id: 'A1' }, { id: 'A2' }] as any,
        adjustments: [{ lineId: 'A1', action: 'EXCLUDE_LINE', status: 'VALIDEE', author: 'x', timestamp: '', comment: '', oldImpact: 0, newImpact: 0 }] as any
      }
    ] as any);

    expect(out).toHaveLength(1);
    expect(out[0].company_id).toBe('C1');
    expect(out[0].blocking_controls).toBe(1);
    expect(out[0].untreated_anomalies).toBe(1);
  });
});
