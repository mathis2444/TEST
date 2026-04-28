import { describe, it, expect } from 'vitest';
import { num } from '../src/core/parseAmounts';
import { dt } from '../src/core/parseDates';
import { computeVatReconciliation } from '../src/core/computeVatReconciliation';
import { aliases, normalizeColumns } from '../src/core/normalizeColumns';
import { buildCabinetConclusion, conclusionMessage } from '../src/core/buildCabinetConclusion';
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
