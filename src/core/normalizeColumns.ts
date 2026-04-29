export const aliases = {
  company: ['company_id', 'organization_id', 'entity_id'],
  companyName: ['company_name'],
  periodStart: ['period_start', 'from_date', 'fiscal_period_start', 'declaration_period_start_at'],
  periodEnd: ['period_end', 'to_date', 'fiscal_period_end', 'declaration_period_end_at'],
  declared: ['declaration_amount', 'declared_amount', 'net_vat_due', 'amount_due', 'vat_payable', 'payment_amount'],
  form: ['declaration_form_name', 'form', 'form_type', 'tax_form', 'form_name'],
  account: ['plan_item_number', 'account_number', 'general_account_number'],
  accountLabel: ['plan_item_label', 'account_label'],
  date: ['date', 'entry_date', 'accounting_date', 'posting_date'],
  debit: ['debit'],
  credit: ['credit'],
  journal: ['journal_code', 'journal_name'],
  journalLabel: ['journal_label'],
  invoice: ['invoice_number', 'fec_pieceref', 'document_number'],
  documentId: ['document_id'],
  documentLabel: ['document_label'],
  id: ['id', 'entry_id', 'line_id'],
  tierId: ['thirdparty_id', 'customer_id', 'counterparty_id'],
  tier: ['thirdparty_plan_item_label', 'customer_name', 'third_party_name']
} as const;

export type NormalizedKeys = Record<string, string | null>;

export function normalizeColumns(row: Record<string, unknown>, aliasConfig = aliases): NormalizedKeys {
  const map = Object.fromEntries(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  const out: NormalizedKeys = {};
  for (const [key, arr] of Object.entries(aliasConfig)) {
    out[key] = arr.find((a) => map[a.toLowerCase()]) ? map[arr.find((a) => map[a.toLowerCase()])!.toLowerCase()] : null;
  }
  return out;
}

export function validateInputSchema(rows: Record<string, unknown>[], requiredAliases: string[]) {
  const first = rows[0] ?? {};
  const normalized = normalizeColumns(first);
  const found = Object.values(normalized).filter(Boolean) as string[];
  const missing = requiredAliases.filter((k) => !normalized[k]);
  const used = requiredAliases.map((k) => normalized[k]).filter(Boolean) as string[];
  const ignored = Object.keys(first).filter((c) => !found.includes(c));
  return { columnsFound: found, columnsMissing: missing, columnsUsed: used, columnsIgnored: ignored };
}
