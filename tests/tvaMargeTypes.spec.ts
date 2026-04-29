import { describe, expect, it } from 'vitest';
import type { MarginDataset, MarginTransaction } from '../src/core/tvaMargeTypes';

describe('tvaMargeTypes', () => {
  it('defines a complete margin transaction structure', () => {
    const tx: MarginTransaction = {
      transaction_id: 'TX-1',
      company_id: 'C1',
      vehicle_id: 'VIN123',
      purchase: {
        invoice_id: 'PUR-1',
        date: '2026-01-10',
        seller_vat_status: 'INDIVIDUAL_OR_NON_TAXABLE',
        price: 10000
      },
      sale: {
        invoice_id: 'SAL-1',
        date: '2026-02-20',
        price: 12000
      },
      currency: 'EUR',
      margin_amount: 2000,
      margin_vat_rate: 0.2,
      margin_vat_amount: 400,
      status: 'READY_FOR_REVIEW'
    };

    expect(tx.vehicle_id).toBe('VIN123');
    expect(tx.margin_amount).toBe(2000);
  });

  it('groups transactions in a dataset scoped by company and period', () => {
    const dataset: MarginDataset = {
      company_id: 'C1',
      period_start: '2026-01-01',
      period_end: '2026-03-31',
      transactions: []
    };

    expect(dataset.company_id).toBe('C1');
    expect(dataset.transactions).toEqual([]);
  });
});
