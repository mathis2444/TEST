export type SellerVatStatus = 'INDIVIDUAL_OR_NON_TAXABLE' | 'TAXABLE' | 'UNKNOWN';

export interface MarginPurchase {
  invoice_id: string;
  date: string;
  seller_vat_status: SellerVatStatus;
  price: number;
}

export interface MarginSale {
  invoice_id: string;
  date: string;
  price: number;
}

export interface MarginTransaction {
  transaction_id: string;
  company_id: string;
  vehicle_id: string;
  purchase: MarginPurchase;
  sale: MarginSale;
  currency: string;
  margin_amount: number;
  margin_vat_rate: number;
  margin_vat_amount: number;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'INCOMPLETE';
}

export interface MarginDataset {
  company_id: string;
  period_start: string;
  period_end: string;
  transactions: MarginTransaction[];
}
