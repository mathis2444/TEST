const SIGNIFICANT_OD_AMOUNT = 1000;
const SIGNIFICANT_DOC_AMOUNT = 500;

interface AnomalyRule {
  code: string;
  level: 'BLOCKING' | 'WARNING' | 'INFO';
  message: string;
  action: string;
  score: number;
}

export function detectAnomalies(lines: Array<any>) {
  const out: any[] = [];
  for (const l of lines) {
    const absNet = Math.abs(Number(l.net_amount ?? 0));
    const issues: AnomalyRule[] = [];

    if (l.vat_category === 'UNMAPPED') {
      issues.push({
        code: 'UNMAPPED_445_SIGNIFICANT',
        level: 'BLOCKING',
        message: 'Compte 445 non mappé détecté.',
        action: 'Compléter le mapping TVA.',
        score: 100
      });
    }

    if (l.journal_code === 'OD' && absNet >= SIGNIFICANT_OD_AMOUNT) {
      issues.push({
        code: 'OD_TVA_SIGNIFICATIVE',
        level: 'WARNING',
        message: 'OD TVA significative détectée.',
        action: 'Contrôler la justification et la pièce associée.',
        score: 90
      });
    }

    if (!l.document_id && absNet >= SIGNIFICANT_DOC_AMOUNT) {
      issues.push({
        code: 'MISSING_DOCUMENT_SIGNIFICANT',
        level: 'WARNING',
        message: 'Absence de document sur une ligne significative.',
        action: 'Rattacher une pièce justificative.',
        score: 80
      });
    }

    if (!l.invoice_number) {
      issues.push({
        code: 'NO_INVOICE_REFERENCE',
        level: 'INFO',
        message: 'Référence facture absente.',
        action: 'Compléter la référence facture si disponible.',
        score: 60
      });
    }

    if (l.vat_category === 'COLLECTEE' && Number(l.debit ?? 0) > Number(l.credit ?? 0)) {
      issues.push({
        code: 'TVA_COLLECTEE_DEBIT',
        level: 'WARNING',
        message: 'TVA collectée enregistrée au débit.',
        action: 'Vérifier le sens comptable et corriger si nécessaire.',
        score: 75
      });
    }

    if (String(l.vat_category ?? '').startsWith('DED') && Number(l.credit ?? 0) > Number(l.debit ?? 0)) {
      issues.push({
        code: 'TVA_DEDUCTIBLE_CREDIT',
        level: 'WARNING',
        message: 'TVA déductible enregistrée au crédit.',
        action: 'Vérifier le sens comptable et corriger si nécessaire.',
        score: 75
      });
    }

    for (const i of issues) {
      out.push({
        ...l,
        anomaly_code: i.code,
        anomaly_level: i.level,
        anomaly_message: i.message,
        anomaly_action: i.action,
        anomaly_score: i.score,
        issues: issues.map((x) => x.code)
      });
    }
  }
  return out;
}
