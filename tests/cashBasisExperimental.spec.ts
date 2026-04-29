import { describe, expect, it } from 'vitest';
import { computeCashBasisExperimental } from '../src/core/computeCashBasisExperimental';

describe('computeCashBasisExperimental', () => {
  it('returns EXPERIMENTAL_NON_CONCLUANT even when numbers look aligned', () => {
    const out = computeCashBasisExperimental({
      company_id: 'C1',
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      vat_declared: 20,
      invoices: [{ invoice_id: 'F1', company_id: 'C1', invoice_date: '2026-01-10', total_ht: 100, vat_amount: 20 }],
      payments: [{ payment_id: 'P1', company_id: 'C1', invoice_id: 'F1', payment_date: '2026-01-20', amount: 120 }]
    });

    expect(out.vat_theoretical_cash_experimental).toBe(20);
    expect(out.status).toBe('EXPERIMENTAL_NON_CONCLUANT');
  });

  it('keeps status non-conclusive with unmatched payments', () => {
    const out = computeCashBasisExperimental({
      company_id: 'C1',
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      vat_declared: 20,
      invoices: [{ invoice_id: 'F1', company_id: 'C1', invoice_date: '2026-01-10', total_ht: 100, vat_amount: 20 }],
      payments: [{ payment_id: 'P2', company_id: 'C1', invoice_id: 'UNKNOWN', payment_date: '2026-01-20', amount: 120 }]
    });

    expect(out.vat_theoretical_cash_experimental).toBe(0);
    expect(out.status).toBe('EXPERIMENTAL_NON_CONCLUANT');
    expect(out.notes.join(' ')).toContain('non rapprochés');
  });
});
