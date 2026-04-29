# TVA sur marge — cadrage préparatoire (module isolé)

## Pourquoi un module dédié

La TVA sur marge ne peut pas être cadrée uniquement via les comptes 445.
Le contrôle nécessite un rapprochement transactionnel entre achat et revente (ex: véhicule), avec calcul de marge taxable.

## Données nécessaires

Pour chaque bien (ex: véhicule), les champs minimaux sont :

1. **Identifiant véhicule** (`vehicle_id`)
2. **Facture d’achat** (`purchase_invoice_id`, date, référence)
3. **Vendeur particulier ou non assujetti** (`seller_vat_status`)
4. **Prix d’achat** (`purchase_price`)
5. **Facture de vente** (`sale_invoice_id`, date, référence)
6. **Prix de vente** (`sale_price`)
7. **Marge** (`margin_amount = sale_price - purchase_price`)
8. **TVA calculée sur marge** (`margin_vat_amount`)

## Modèle de données proposé

### Entité `MarginTransaction`

- `transaction_id`: identifiant technique de la transaction marge
- `company_id`: dossier/société
- `vehicle_id`: identifiant véhicule (ou identifiant bien)
- `purchase`: bloc achat
  - `invoice_id`
  - `date`
  - `seller_vat_status` (`INDIVIDUAL_OR_NON_TAXABLE` / `TAXABLE` / `UNKNOWN`)
  - `price`
- `sale`: bloc vente
  - `invoice_id`
  - `date`
  - `price`
- `currency`: devise
- `margin_amount`: marge brute
- `margin_vat_rate`: taux de TVA marge
- `margin_vat_amount`: TVA calculée sur marge
- `status`: état de complétude (`DRAFT` / `READY_FOR_REVIEW` / `INCOMPLETE`)

### Entité `MarginDataset`

- `company_id`
- `period_start`
- `period_end`
- `transactions: MarginTransaction[]`

## Limites (V1)

- Module **non connecté** au calcul principal de cadrage TVA sur débits.
- Aucune conclusion FIABLE ne doit être produite à ce stade sur la marge.
- Le périmètre actuel est uniquement documentaire + types pour préparer l’implémentation.
