import type { Control, ReconciliationSummary } from '../types';

export interface CabinetConclusion {
  company: string;
  period: string;
  regime: ReconciliationSummary['regime_tva'];
  declaredVat: number;
  theoreticalVat: number;
  gap: number;
  threshold: number;
  finalStatus: ReconciliationSummary['reconciliation_confidence_score'];
  blockingControls: string[];
  message: string;
  regimeAlert?: string;
}

export function conclusionMessage(status: ReconciliationSummary['reconciliation_confidence_score']) {
  switch (status) {
    case 'FIABLE':
      return 'Le cadrage TVA ne présente pas d’écart significatif au regard du seuil retenu.';
    case 'A_CONTROLER':
      return 'Un écart ou des contrôles nécessitent une revue.';
    default:
      return 'Le cadrage ne permet pas de conclure sans analyse complémentaire.';
  }
}

export function regimeAlert(regime: ReconciliationSummary['regime_tva']) {
  if (regime === 'encaissements') {
    return 'Alerte : le régime TVA sur encaissements nécessite un moteur dédié. Le statut reste NON_CONCLUANT en V1.';
  }
  if (regime === 'marge') {
    return 'Alerte : le régime TVA sur marge nécessite un moteur dédié. Le statut reste NON_CONCLUANT en V1.';
  }
  return undefined;
}

export function buildCabinetConclusion(summary: ReconciliationSummary, threshold: number, controls: Control[] = []): CabinetConclusion {
  const status = ['encaissements', 'marge'].includes(summary.regime_tva) ? 'NON_CONCLUANT' : summary.reconciliation_confidence_score;
  const blockingControls = controls.filter((c) => c.level === 'BLOCKING').map((c) => c.code);

  return {
    company: summary.company_name || summary.company_id,
    period: `${summary.period_start} → ${summary.period_end}`,
    regime: summary.regime_tva,
    declaredVat: summary.declaration_amount,
    theoreticalVat: summary.vat_theoretical_period,
    gap: summary.cadrage_gap_adjusted,
    threshold,
    finalStatus: status,
    blockingControls,
    message: conclusionMessage(status),
    regimeAlert: regimeAlert(summary.regime_tva)
  };
}
