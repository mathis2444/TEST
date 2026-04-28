import { num } from './parseAmounts';

export interface MappingRow { company_id: string; account_prefix: string; vat_category: string; direction: string; sign_factor: number; priority: number; is_active: string; }

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
      const matched = active
        .filter((m) => (m.company_id === companyId || m.company_id === '__DEFAULT__') && account.startsWith(String(m.account_prefix)))
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || b.account_prefix.length - a.account_prefix.length)[0];

      const category = matched?.vat_category ?? 'UNMAPPED';
      const sign = matched ? Number(matched.sign_factor ?? 1) : 1;
      let normalized = debit - credit;
      switch (category) {
        case 'COLLECTEE':
        case 'DUE_AUTOLIQ':
          normalized = (credit - debit) * sign;
          break;
        case 'DED_ABS':
        case 'DED_IMMO':
        case 'DED_AUTOLIQ':
        case 'CREDIT_ANTERIEUR':
          normalized = (debit - credit) * sign;
          break;
        default:
          normalized = (debit - credit) * sign;
      }

      return {
        id: buildLineId(r, keys),
        account_number: account,
        entry_date: String(r[keys.date ?? ''] ?? ''),
        journal_code: String(r[keys.journal ?? ''] ?? ''),
        invoice_number: String(r[keys.invoice ?? ''] ?? ''),
        document_id: String(r[keys.documentId ?? ''] ?? ''),
        debit,
        credit,
        net_amount: debit - credit,
        vat_category: category,
        normalized_amount: normalized
      };
    });
}
