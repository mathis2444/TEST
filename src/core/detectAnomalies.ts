export function detectAnomalies(lines: Array<any>) {
  const out: any[] = [];
  for (const l of lines) {
    const issues: { code: string; score: number }[] = [];
    if (l.vat_category === 'UNMAPPED') issues.push({ code: 'UNMAPPED_445_SIGNIFICANT', score: 100 });
    if (l.journal_code === 'OD' && Math.abs(l.net_amount) > 1000) issues.push({ code: 'OD_TVA_SIGNIFICATIVE', score: 90 });
    if (!l.document_id) issues.push({ code: 'NO_DOCUMENT_REFERENCE', score: 70 });
    if (!l.invoice_number) issues.push({ code: 'NO_INVOICE_REFERENCE', score: 60 });
    if ((l.account_number.startsWith('44571') && l.debit > l.credit) || (l.account_number.startsWith('44566') && l.credit > l.debit)) issues.push({ code: 'SIGN_TO_REVIEW', score: 65 });

    for (const i of issues) {
      out.push({ ...l, anomaly_code: i.code, anomaly_score: i.score, issues: issues.map((x) => x.code) });
    }
  }
  return out;
}
