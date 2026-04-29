import { dt } from './parseDates';
import { num } from './parseAmounts';

export interface MappingRow {
  company_id: string;
  account_prefix: string;
  vat_category: string;
  direction: 'DEBIT' | 'CREDIT' | 'NET' | string;
  sign_factor: number;
  priority: number;
  valid_from?: string;
  valid_to?: string;
  is_active: string | boolean;
}

export function buildLineId(r: Record<string, unknown>, keys: Record<string, string | null>): string {
  return [r[keys.id ?? ''] ?? '', r[keys.documentId ?? ''] ?? '', r[keys.invoice ?? ''] ?? '', r[keys.date ?? ''] ?? '', r[keys.account ?? ''] ?? '', r[keys.debit ?? ''] ?? '', r[keys.credit ?? ''] ?? ''].join('|');
}

export function classifyVatLines(
  rows: Record<string, unknown>[],
  keys: Record<string, string | null>,
  mapping: MappingRow[],
  companyId: string
) {
  const active = mapping.filter((m) => String(m.is_active).toLowerCase() !== 'false');

  return rows
    .filter((r) => String(r[keys.account ?? ''] ?? '').startsWith('445'))
    .map((r) => {
      const account = String(r[keys.account ?? ''] ?? '');
      const debit = num(r[keys.debit ?? '']);
      const credit = num(r[keys.credit ?? '']);
      const lineDate = dt(r[keys.date ?? '']);

      const candidates = active
        .filter((m) => (m.company_id === companyId || m.company_id === '__DEFAULT__') && account.startsWith(String(m.account_prefix)))
        .filter((m) => {
          const vf = m.valid_from ? dt(m.valid_from) : null;
          const vt = m.valid_to ? dt(m.valid_to) : null;
          if (!lineDate) return true;
          if (vf && lineDate < vf) return false;
          if (vt && lineDate > vt) return false;
          return true;
        })
        .sort((a, b) =>
          (a.priority ?? 999) - (b.priority ?? 999) ||
          (a.company_id === companyId ? -1 : 1) - (b.company_id === companyId ? -1 : 1) ||
          b.account_prefix.length - a.account_prefix.length
        );

      const matched = candidates[0];
      const category = matched?.vat_category ?? 'UNMAPPED';
      const sign = matched ? Number(matched.sign_factor ?? 1) : 1;
      const direction = (matched?.direction ?? 'NET').toUpperCase();

      let normalized = (debit - credit) * sign;
      if (direction === 'DEBIT') normalized = debit * sign;
      if (direction === 'CREDIT') normalized = credit * sign;
      if (direction === 'NET') normalized = (debit - credit) * sign;

      return {
        id: buildLineId(r, keys),
        account_number: account,
        account_label: String(r[keys.accountLabel ?? ''] ?? ''),
        entry_date: String(r[keys.date ?? ''] ?? ''),
        journal_code: String(r[keys.journal ?? ''] ?? ''),
        invoice_number: String(r[keys.invoice ?? ''] ?? ''),
        document_id: String(r[keys.documentId ?? ''] ?? ''),
        debit,
        credit,
        net_amount: debit - credit,
        vat_category: category,
        normalized_amount: normalized,
        mapped: Boolean(matched)
      };
    });
}
