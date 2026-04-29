# TVA sur encaissements — moteur expérimental (V1)

## Objectif

Ce document décrit les données minimales nécessaires pour une première version expérimentale du cadrage TVA sur encaissements.

> Cette version est volontairement prudente : le statut reste `EXPERIMENTAL_NON_CONCLUANT` tant que le rapprochement factures/règlements n'est pas robuste.

## Données nécessaires

### 1) Factures clients

Champs requis :

- `invoice_id` (identifiant facture)
- `company_id`
- `customer_id` (si disponible)
- `invoice_date`
- `due_date` (si disponible)
- `total_ttc`
- `total_ht`
- `vat_amount`
- `vat_rate` (si disponible)

### 2) Règlements

Champs requis :

- `payment_id`
- `company_id`
- `invoice_id` (ou référence de lettrage)
- `payment_date` (**date d'encaissement**)
- `amount`
- `payment_method` (si disponible)
- `bank_account` (si disponible)

### 3) Comptes 411 (clients)

Champs requis GL :

- `entry_id`
- `company_id`
- `entry_date`
- `account_number` (préfixe `411`)
- `debit`
- `credit`
- `document_id` / `invoice_number`

### 4) Banque

Champs requis GL :

- `entry_id`
- `company_id`
- `entry_date`
- `account_number` (préfixe `512`)
- `debit`
- `credit`
- `document_id`

### 5) Dates d'encaissement

Référence principale du moteur expérimental :

- date de règlement (`payment_date`) si disponible,
- sinon date de mouvement bancaire rattaché.

## Principe V1 expérimental

1. Agréger les règlements sur la période.
2. Rattacher les règlements aux factures via `invoice_id` / références.
3. Estimer une TVA encaissée théorique (pro-rata simple HT/TVA de la facture).
4. Produire un écart vs TVA déclarée.
5. Retourner **toujours** le statut `EXPERIMENTAL_NON_CONCLUANT`.

## Limites connues

- Lettrage facture/règlement parfois incomplet.
- Acomptes, avoirs, paiements partiels non totalement couverts.
- Multi-règlements et régularisations complexes non robustes en V1.
- Aucun résultat ne doit être présenté comme FIABLE en l'état.
