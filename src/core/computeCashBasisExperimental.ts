export type CashBasisExperimentalStatus = 'EXPERIMENTAL_NON_CONCLUANT';

export interface CashInvoice {
  invoice_id: string;
  company_id: string;
  invoice_date: string;
  total_ht: number;
  vat_amount: number;
}

export interface CashPayment {
  payment_id: string;
  company_id: string;
  invoice_id?: string;
  payment_date: string;
  amount: number;
}

export interface CashBasisExperimentalResult {
  company_id: string;
  period_start: string;
  period_end: string;
  vat_declared: number;
  vat_theoretical_cash_experimental: number;
  gap: number;
  status: CashBasisExperimentalStatus;
  notes: string[];
}

function inPeriod(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

export function computeCashBasisExperimental(params: {
  company_id: string;
  period_start: string;
  period_end: string;
  vat_declared: number;
  invoices: CashInvoice[];
  payments: CashPayment[];
}) : CashBasisExperimentalResult {
  const invoicesById = new Map(
    params.invoices
      .filter((i) => i.company_id === params.company_id)
      .map((i) => [i.invoice_id, i])
  );

  const payments = params.payments.filter((p) => p.company_id === params.company_id && inPeriod(p.payment_date, params.period_start, params.period_end));

  let theoretical = 0;
  let unmatchedPayments = 0;

  for (const p of payments) {
    const inv = p.invoice_id ? invoicesById.get(p.invoice_id) : undefined;
    if (!inv || inv.total_ht <= 0) {
      unmatchedPayments += 1;
      continue;
    }

    const ttc = inv.total_ht + inv.vat_amount;
    if (ttc <= 0) {
      unmatchedPayments += 1;
      continue;
    }

    const ratio = p.amount / ttc;
    theoretical += inv.vat_amount * ratio;
  }

  const gap = params.vat_declared - theoretical;

  return {
    company_id: params.company_id,
    period_start: params.period_start,
    period_end: params.period_end,
    vat_declared: params.vat_declared,
    vat_theoretical_cash_experimental: theoretical,
    gap,
    status: 'EXPERIMENTAL_NON_CONCLUANT',
    notes: [
      'Moteur encaissements expérimental : rapprochement factures/règlements partiel.',
      `Paiements non rapprochés: ${unmatchedPayments}`,
      'Aucun résultat ne doit être interprété comme FIABLE.'
    ]
  };
}
