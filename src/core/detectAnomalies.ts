export function detectAnomalies(lines: Array<any>) {
  return lines
    .map((l) => {
      let code = 'OK';
      if (l.vat_category === 'UNMAPPED') code = 'UNMAPPED_445_SIGNIFICANT';
      else if (l.journal_code === 'OD' && Math.abs(l.net_amount) > 1000) code = 'OD_TVA_SIGNIFICATIVE';
      else if (!l.document_id) code = 'NO_DOCUMENT_REFERENCE';
      else if (!l.invoice_number) code = 'NO_INVOICE_REFERENCE';
      else if ((l.account_number.startsWith('44571') && l.debit > l.credit) || (l.account_number.startsWith('44566') && l.credit > l.debit)) code = 'SIGN_TO_REVIEW';
      return { ...l, anomaly_code: code, anomaly_score: code === 'OK' ? 0 : (code === 'UNMAPPED_445_SIGNIFICANT' ? 100 : 70) };
    })
    .filter((x) => x.anomaly_code !== 'OK');
}
