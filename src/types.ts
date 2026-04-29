export type RegimeTva = 'debits' | 'encaissements' | 'mixte' | 'marge';

export type ControlLevel = 'INFO' | 'WARNING' | 'BLOCKING';
export interface Control {
  code: string;
  level: ControlLevel;
  message: string;
  action: string;
  impact: string;
}

export type ReviewStatus = 'A_TRAITER' | 'JUSTIFIEE' | 'CORRECTION_PROPOSEE' | 'VALIDEE' | 'REJETEE' | 'NON_SIGNIFICATIVE';

export interface Adjustment {
  lineId: string;
  action: 'EXCLUDE_LINE' | 'SIGN_INVERT' | 'REMAP_COLLECTEE' | 'REMAP_DED_ABS' | 'REMAP_DED_IMMO';
  status: ReviewStatus;
  author: string;
  timestamp: string;
  reviewDate?: string;
  comment: string;
  oldImpact: number;
  newImpact: number;
}

export interface ReconciliationSummary {
  company_id: string;
  company_name?: string;
  period_start: string;
  period_end: string;
  fiscal_year_start: string;
  regime_tva: RegimeTva;
  declaration_form_name: string;
  declaration_amount: number;
  payment_amount: number;
  vat_theoretical_period: number;
  cadrage_gap_period: number;
  cadrage_gap_adjusted: number;
  gap_status: 'OK' | 'A_CONTROLER';
  tax_declaration_status: string;
  is_declaration_validated: boolean;
  is_payment_validated: boolean;
  reconciliation_confidence_score: 'FIABLE' | 'A_CONTROLER' | 'NON_CONCLUANT';
}
