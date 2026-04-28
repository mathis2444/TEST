import { describe, it, expect } from 'vitest';
import { num } from '../src/core/parseAmounts';
import { dt } from '../src/core/parseDates';
import { computeVatReconciliation } from '../src/core/computeVatReconciliation';
import { aliases, normalizeColumns } from '../src/core/normalizeColumns';
import fs from 'node:fs';
import Papa from 'papaparse';

function csv(path: string) {
  return Papa.parse(fs.readFileSync(path, 'utf8'), { header: true, skipEmptyLines: true }).data as Record<string, unknown>[];
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

describe('reconciliation', () => {
  const vat = csv('tests/sample_vat_declarations.csv');
  const tax = csv('tests/sample_tax_declarations.csv');
  const gl = csv('tests/sample_general_ledger.csv');
  const mapping = csv('tests/sample_mapping.csv') as any[];
  const keysVat = normalizeColumns(vat[0], aliases);
  const keysGl = normalizeColumns(gl[0], aliases);

  it('ignores non TVA tax declarations', () => {
    const r = computeVatReconciliation({
      companyId: 'C1',
      vatDeclarations: vat,
      taxDeclarations: tax,
      generalLedger: gl,
      mapping,
      selectedPeriodStart: '2026-01-01',
      selectedPeriodEnd: '2026-01-31',
      fiscalYearStart: '2026-01-01',
      regimeTva: 'debits',
      threshold: 5,
      keysVat,
      keysGl,
      adjustments: []
    });
    expect(r.summary.declaration_form_name).toBe('CA3');
    expect(r.summary.tax_declaration_status).toBe('ACCEPTED');
  });

  it('treats 44551 as explanatory only', () => {
    const gl2 = [...gl, {
      company_id: 'C1', date: '31/01/2026', plan_item_number: '44551', plan_item_label: 'TVA a decaisser', debit: '0', credit: '500', journal_code: 'OD', invoice_number: '', document_id: 'X', thirdparty_id: '', thirdparty_plan_item_label: '', id: 'X1'
    }];
    const r = computeVatReconciliation({
      companyId: 'C1', vatDeclarations: vat, taxDeclarations: tax, generalLedger: gl2, mapping,
      selectedPeriodStart: '2026-01-01', selectedPeriodEnd: '2026-01-31', fiscalYearStart: '2026-01-01', regimeTva: 'debits', threshold: 5, keysVat, keysGl, adjustments: []
    });
    expect(r.categoryTotals.get('TVA_A_DECAISSER')).toBeDefined();
  });

  it('flags autoliq unbalanced', () => {
    const gl2 = [...gl, { company_id:'C1', date:'31/01/2026', plan_item_number:'4452', debit:'0', credit:'300', journal_code:'OD', document_id:'A', invoice_number:'', id:'A', thirdparty_plan_item_label:'' } as any];
    const r = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl2, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'debits', threshold:5, keysVat, keysGl, adjustments:[] });
    expect(r.controls.some(c => c.code === 'AUTOLIQ_NOT_BALANCED')).toBe(true);
  });

  it('cash basis is never fiable', () => {
    const r = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'encaissements', threshold:5, keysVat, keysGl, adjustments:[] });
    expect(r.summary.reconciliation_confidence_score).toBe('NON_CONCLUANT');
  });

  it('malicious html in csv is rendered as text in UI helper not tested here but anomaly generated safely', () => {
    const gl2 = [...gl, { company_id:'C1', date:'31/01/2026', plan_item_number:'44599', debit:'1', credit:'0', journal_code:'OD', document_id:'<img src=x onerror=alert(1)>', invoice_number:'', id:'M1', thirdparty_plan_item_label:'<script>alert(1)</script>' } as any];
    const r = computeVatReconciliation({ companyId:'C1', vatDeclarations:vat, taxDeclarations:tax, generalLedger:gl2, mapping, selectedPeriodStart:'2026-01-01', selectedPeriodEnd:'2026-01-31', fiscalYearStart:'2026-01-01', regimeTva:'debits', threshold:5, keysVat, keysGl, adjustments:[] });
    expect(r.anomalies.some(a => a.anomaly_code === 'UNMAPPED_445_SIGNIFICANT')).toBe(true);
  });
});
