# Synthèse rapide

Proposition de **cadrage TVA orienté cabinet comptable**, fondé sur le **grand livre** (source principale), puis rapproché de la déclaration.

- Source déclarative : `vat_declarations` (prioritaire) + `tax_declarations` (statut/validation/paiement).  
- Source comptable : `general_ledger` (recalcul théorique TVA).  
- Sorties : montant déclaré, montant GL recalculé, écart, détail par compte 445, détail par catégorie TVA, écritures explicatives.  
- **Antériorité intégrée** : recalcul cumulatif du **1er jour de l’exercice** jusqu’à la période sélectionnée (YTD fiscal), plus vue période seule.  
- Approche prudente : les noms de champs exacts peuvent varier selon le connecteur/entrepôt ; la méthode prévoit des équivalents.

---

# Architecture

## 1) Logique fonctionnelle (cabinet)

1. **Identifier la société + période TVA** (mois/trimestre) **et la date d’ouverture d’exercice**.
2. **Construire 2 périmètres de calcul** : (a) période sélectionnée, (b) cumul exercice (`fiscal_year_start` -> `period_end`).
3. **Récupérer la déclaration** (montant net à payer / crédit, formulaire, statut).
4. **Récupérer le grand livre** (écritures détaillées) sur les 2 périmètres.
5. **Isoler et classifier les comptes TVA** via un mapping paramétrable (table dédiée).
6. **Recalculer la TVA théorique comptable** (logique signes + catégories) en vue période et cumul exercice.
7. **Comparer déclaré vs recalculé** et sortir l’écart.
8. **Qualifier les écarts** (OD TVA, report crédit, autoliquidation, décalage période, PCA/FAE, etc.).
9. **Produire l’analyse client** (concentration du CA taxable et de la TVA collectée par client/tiers).

## 2) Rôle des tables

- `vat_declarations` : référence de déclaration TVA par période (montants, période, formulaire, éventuellement net dû/crédit).  
- `tax_declarations` : enrichissement statut fiscal (validée, déposée, payée, date de paiement, montant payé si disponible).  
- `general_ledger` : base de recalcul comptable (débit/crédit, compte 445, journaux, pièces, factures, tiers, dates).

## 3) Principe de robustesse

- Le **cadrage principal** est toujours :  
  `TVA théorique GL` vs `TVA déclarée`.
- Si les cases CA3 détaillées ne sont pas disponibles : produire un **cadrage global** fiable + détails analytiques par compte/catégorie.
- Le mapping TVA est externalisé en table, **jamais hardcodé** dans le SQL métier.

---

# Champs

> Hypothèse : les champs ci-dessous sont les plus probables. Si absents, utiliser les équivalents indiqués.

## `vat_declarations` (déclaration TVA)

Champs attendus (ou équivalents) :

- `company_id` (ou `organization_id`, `entity_id`) : société.
- `declaration_id` (ou `id`) : identifiant déclaration.
- `form_type` (ou `tax_form`, `form_name`, ex. CA3/CA12) : formulaire.
- `period_start`, `period_end` (ou `from_date`, `to_date`, `fiscal_period_*`) : période.
- `declared_amount` (ou `net_vat_due`, `amount_due`, `vat_payable`) : montant net déclaré.
- `declared_credit_amount` (ou `vat_credit`) : crédit de TVA déclaré.
- `currency` : devise.
- `status` (draft/submitted/validated).
- `filed_at` (date dépôt), `validated_at` (date validation).
- `created_at`, `updated_at`.

## `tax_declarations` (statut/paiement)

- `company_id`.
- `tax_declaration_id` (ou `id`).
- `source_declaration_id` (clé vers `vat_declarations.declaration_id`, si disponible).
- `tax_type` (TVA/IS/etc.) — filtrer TVA.
- `status` (préparée, validée, payée).
- `payment_status`.
- `payment_amount` (ou `paid_amount`).
- `payment_date`.
- `due_date`.
- `reference` (référence paiement/télédéclaration).

## `general_ledger` (base recalcul)

- `company_id`.
- `entry_id` / `line_id` : identifiant écriture/ligne.
- `entry_date` (ou `accounting_date`, `posting_date`) : date comptable.
- `period` (si présent).
- `journal_code` / `journal_name` : journal (VE, AC, OD, BQ...).
- `account_number` (ou `general_account_number`) : compte général.
- `account_label` : libellé compte.
- `debit`, `credit`.
- `balance` (optionnel, sinon recalcul `debit-credit`).
- `entry_label` / `line_label` : libellé écriture.
- `piece_number` / `document_number` : pièce.
- `invoice_number` (si disponible).
- `document_id` / `attachment_id` (si disponible).
- `counterparty_id` / `third_party_name` (si disponible).
- `vat_rate` / `tax_code` (si disponible, utile pour autoliquidation).
- `due_date` / `service_period_start` / `service_period_end` (si disponibles, utile PCA/FAE).
- `customer_id` / `customer_name` (si disponibles, utile analyse client).

---

# Mapping

## Modèle de table de mapping paramétrable

```sql
-- Table de paramétrage centrale (à maintenir par le cabinet)
CREATE TABLE IF NOT EXISTS vat_account_mapping (
    mapping_id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id               VARCHAR(64) NOT NULL,              -- mapping spécifique dossier
    account_prefix           VARCHAR(20) NOT NULL,              -- ex: '44571', '44566', '4452'
    vat_category             VARCHAR(100) NOT NULL,             -- ex: COLLECTEE, DED_ABS, DED_IMMO...
    direction                VARCHAR(10) NOT NULL,              -- 'DEBIT', 'CREDIT', 'NET'
    sign_factor              SMALLINT NOT NULL DEFAULT 1,       -- +1 / -1 pour normaliser
    priority                 INTEGER NOT NULL DEFAULT 100,      -- gère les conflits de préfixes
    valid_from               DATE NOT NULL,
    valid_to                 DATE,
    is_active                BOOLEAN NOT NULL DEFAULT TRUE,
    notes                    VARCHAR(255)
);
```

## Exemples de catégories recommandées

- `COLLECTEE`
- `DED_ABS` (déductible autres biens/services)
- `DED_IMMO`
- `DUE_AUTOLIQ`
- `DED_AUTOLIQ`
- `CREDIT_ANTERIEUR`
- `TVA_A_DECAISSER`
- `REGULARISATION_TVA`
- `ECART_IMPUTATION`

## Bonnes pratiques mapping

- Mapper par **préfixe de compte** (`LIKE '44571%'`) pour capter les variantes.
- Autoriser un mapping par société (ou mapping global fallback).
- Gérer les changements dans le temps (`valid_from`, `valid_to`).
- Prévoir une catégorie « non classé » pour pilotage qualité.

---

# SQL

> SQL générique ANSI (adaptable PostgreSQL/Snowflake/BigQuery).  
> Paramètres attendus : `:company_id`, `:period_start`, `:period_end`, `:fiscal_year_start`.
> Bonne pratique : fixer `:fiscal_year_start` au **1er jour de l’exercice** (ex. `2026-01-01`).

## A. Récupérer la déclaration sur une période

```sql
WITH vat_decl AS (
    SELECT
        vd.company_id,
        vd.declaration_id,
        COALESCE(vd.form_type, vd.tax_form, vd.form_name) AS form_type,
        COALESCE(vd.period_start, vd.from_date) AS period_start,
        COALESCE(vd.period_end, vd.to_date)     AS period_end,
        COALESCE(vd.declared_amount, vd.net_vat_due, vd.amount_due, 0) AS declared_amount,
        COALESCE(vd.declared_credit_amount, vd.vat_credit, 0) AS declared_credit_amount,
        vd.status,
        vd.filed_at,
        vd.validated_at
    FROM vat_declarations vd
    WHERE vd.company_id = :company_id
      AND COALESCE(vd.period_start, vd.from_date) >= :period_start
      AND COALESCE(vd.period_end, vd.to_date) <= :period_end
)
SELECT *
FROM vat_decl;
```

## B. Statut/ paiement complémentaire via `tax_declarations`

```sql
SELECT
    td.company_id,
    td.tax_declaration_id,
    td.source_declaration_id,
    td.tax_type,
    td.status,
    td.payment_status,
    COALESCE(td.payment_amount, td.paid_amount, 0) AS paid_amount,
    td.payment_date,
    td.due_date,
    td.reference
FROM tax_declarations td
WHERE td.company_id = :company_id
  AND UPPER(COALESCE(td.tax_type, 'TVA')) LIKE '%TVA%';
```

## C. Récupérer les écritures GL sur période

```sql
SELECT
    gl.company_id,
    gl.entry_id,
    gl.line_id,
    COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) AS entry_date,
    gl.journal_code,
    gl.journal_name,
    COALESCE(gl.account_number, gl.general_account_number) AS account_number,
    gl.account_label,
    COALESCE(gl.debit, 0)  AS debit,
    COALESCE(gl.credit, 0) AS credit,
    (COALESCE(gl.debit,0) - COALESCE(gl.credit,0)) AS net_debit_credit,
    gl.entry_label,
    gl.line_label,
    gl.piece_number,
    gl.document_number,
    gl.invoice_number,
    gl.document_id,
    gl.counterparty_id,
    gl.third_party_name,
    gl.tax_code,
    gl.vat_rate
FROM general_ledger gl
WHERE gl.company_id = :company_id
  AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date)
      BETWEEN :period_start AND :period_end;
```

## D. Isoler les comptes TVA (classe 445)

```sql
WITH gl_period AS (
    SELECT
        gl.*,
        COALESCE(gl.account_number, gl.general_account_number) AS account_number_std,
        COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) AS entry_date_std,
        COALESCE(gl.debit,0) AS debit_std,
        COALESCE(gl.credit,0) AS credit_std
    FROM general_ledger gl
    WHERE gl.company_id = :company_id
      AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date)
          BETWEEN :period_start AND :period_end
)
SELECT *
FROM gl_period
WHERE account_number_std LIKE '445%';
```

## E. Synthèse par compte 445

```sql
WITH vat_lines AS (
    SELECT
        COALESCE(gl.account_number, gl.general_account_number) AS account_number,
        COALESCE(gl.debit,0) AS debit,
        COALESCE(gl.credit,0) AS credit
    FROM general_ledger gl
    WHERE gl.company_id = :company_id
      AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date)
          BETWEEN :period_start AND :period_end
      AND COALESCE(gl.account_number, gl.general_account_number) LIKE '445%'
)
SELECT
    account_number,
    SUM(debit) AS total_debit,
    SUM(credit) AS total_credit,
    SUM(debit - credit) AS net_balance
FROM vat_lines
GROUP BY account_number
ORDER BY account_number;
```

## F. Synthèse par catégorie TVA (avec mapping paramétrable)

```sql
WITH gl_vat AS (
    SELECT
        gl.company_id,
        COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) AS entry_date,
        COALESCE(gl.account_number, gl.general_account_number) AS account_number,
        COALESCE(gl.debit,0) AS debit,
        COALESCE(gl.credit,0) AS credit,
        (COALESCE(gl.debit,0) - COALESCE(gl.credit,0)) AS net_amount
    FROM general_ledger gl
    WHERE gl.company_id = :company_id
      AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date)
          BETWEEN :period_start AND :period_end
      AND COALESCE(gl.account_number, gl.general_account_number) LIKE '445%'
),
match_map AS (
    SELECT
        gv.*,
        m.vat_category,
        m.direction,
        m.sign_factor,
        ROW_NUMBER() OVER (
            PARTITION BY gv.company_id, gv.entry_date, gv.account_number, gv.debit, gv.credit
            ORDER BY m.priority ASC, LENGTH(m.account_prefix) DESC
        ) AS rn
    FROM gl_vat gv
    LEFT JOIN vat_account_mapping m
      ON m.company_id = gv.company_id
     AND m.is_active = TRUE
     AND gv.entry_date >= m.valid_from
     AND (m.valid_to IS NULL OR gv.entry_date <= m.valid_to)
     AND gv.account_number LIKE CONCAT(m.account_prefix, '%')
),
classified AS (
    SELECT
        company_id,
        entry_date,
        account_number,
        debit,
        credit,
        COALESCE(vat_category, 'UNMAPPED') AS vat_category,
        CASE
            WHEN direction = 'DEBIT' THEN debit
            WHEN direction = 'CREDIT' THEN credit
            ELSE net_amount
        END * COALESCE(sign_factor, 1) AS normalized_amount
    FROM match_map
    WHERE rn = 1
)
SELECT
    vat_category,
    SUM(normalized_amount) AS category_amount
FROM classified
GROUP BY vat_category
ORDER BY vat_category;
```

## G. Recalcul TVA théorique comptable

```sql
WITH category_totals AS (
    -- Réutiliser la requête F (classified -> agrégation)
    SELECT
        vat_category,
        SUM(normalized_amount) AS amount
    FROM (
        SELECT
            COALESCE(m.vat_category, 'UNMAPPED') AS vat_category,
            CASE
                WHEN m.direction = 'DEBIT' THEN COALESCE(gl.debit,0)
                WHEN m.direction = 'CREDIT' THEN COALESCE(gl.credit,0)
                ELSE (COALESCE(gl.debit,0) - COALESCE(gl.credit,0))
            END * COALESCE(m.sign_factor,1) AS normalized_amount
        FROM general_ledger gl
        LEFT JOIN vat_account_mapping m
          ON m.company_id = gl.company_id
         AND COALESCE(gl.account_number, gl.general_account_number) LIKE CONCAT(m.account_prefix, '%')
         AND m.is_active = TRUE
         AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) >= m.valid_from
         AND (m.valid_to IS NULL OR COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) <= m.valid_to)
        WHERE gl.company_id = :company_id
          AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date)
              BETWEEN :period_start AND :period_end
          AND COALESCE(gl.account_number, gl.general_account_number) LIKE '445%'
    ) x
    GROUP BY vat_category
)
SELECT
    SUM(CASE WHEN vat_category = 'COLLECTEE'        THEN amount ELSE 0 END)
  - SUM(CASE WHEN vat_category IN ('DED_ABS','DED_IMMO') THEN amount ELSE 0 END)
  + SUM(CASE WHEN vat_category = 'DUE_AUTOLIQ'      THEN amount ELSE 0 END)
  - SUM(CASE WHEN vat_category = 'DED_AUTOLIQ'      THEN amount ELSE 0 END)
  - SUM(CASE WHEN vat_category = 'CREDIT_ANTERIEUR' THEN amount ELSE 0 END)
  + SUM(CASE WHEN vat_category = 'REGULARISATION_TVA' THEN amount ELSE 0 END)
    AS vat_theoretical_amount
FROM category_totals;
```

## H. Comparer TVA déclarée vs TVA théorique

```sql
WITH declared AS (
    SELECT
        vd.company_id,
        vd.declaration_id,
        COALESCE(vd.form_type, vd.tax_form, vd.form_name) AS form_type,
        COALESCE(vd.period_start, vd.from_date) AS period_start,
        COALESCE(vd.period_end, vd.to_date) AS period_end,
        COALESCE(vd.declared_amount, vd.net_vat_due, vd.amount_due, 0) AS declared_amount,
        COALESCE(td.payment_amount, td.paid_amount, 0) AS paid_amount,
        COALESCE(td.status, vd.status) AS declaration_status
    FROM vat_declarations vd
    LEFT JOIN tax_declarations td
      ON td.company_id = vd.company_id
     AND (td.source_declaration_id = vd.declaration_id OR td.tax_declaration_id = vd.declaration_id)
    WHERE vd.company_id = :company_id
      AND COALESCE(vd.period_start, vd.from_date) >= :period_start
      AND COALESCE(vd.period_end, vd.to_date) <= :period_end
),
vat_theoretical AS (
    -- Remplacer par requête G
    SELECT :company_id AS company_id, 0.00 AS vat_theoretical_amount
)
SELECT
    d.company_id,
    d.declaration_id,
    d.form_type,
    d.period_start,
    d.period_end,
    d.declared_amount,
    d.paid_amount,
    d.declaration_status,
    t.vat_theoretical_amount,
    (d.declared_amount - t.vat_theoretical_amount) AS cadrage_gap
FROM declared d
CROSS JOIN vat_theoretical t;
```

## I. Détail des écarts (écritures explicatives)

```sql
WITH mapped AS (
    SELECT
        gl.company_id,
        COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) AS entry_date,
        gl.journal_code,
        COALESCE(gl.account_number, gl.general_account_number) AS account_number,
        gl.entry_label,
        gl.line_label,
        gl.piece_number,
        gl.document_number,
        gl.invoice_number,
        COALESCE(gl.debit,0) AS debit,
        COALESCE(gl.credit,0) AS credit,
        (COALESCE(gl.debit,0) - COALESCE(gl.credit,0)) AS net_amount,
        COALESCE(m.vat_category, 'UNMAPPED') AS vat_category
    FROM general_ledger gl
    LEFT JOIN vat_account_mapping m
      ON m.company_id = gl.company_id
     AND COALESCE(gl.account_number, gl.general_account_number) LIKE CONCAT(m.account_prefix, '%')
     AND m.is_active = TRUE
     AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) >= m.valid_from
     AND (m.valid_to IS NULL OR COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) <= m.valid_to)
    WHERE gl.company_id = :company_id
      AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date)
          BETWEEN :period_start AND :period_end
      AND COALESCE(gl.account_number, gl.general_account_number) LIKE '445%'
),
flags AS (
    SELECT
        *,
        CASE
            WHEN vat_category = 'UNMAPPED' THEN 'Compte 445 non mappé'
            WHEN journal_code = 'OD' THEN 'OD TVA à contrôler'
            WHEN account_number LIKE '44567%' OR account_number LIKE '4452%' THEN 'Autoliquidation / intracom possible'
            WHEN account_number LIKE '44551%' OR account_number LIKE '44558%' THEN 'TVA à décaisser / régularisation'
            ELSE 'A investiguer'
        END AS probable_cause
    FROM mapped
)
SELECT
    entry_date,
    journal_code,
    account_number,
    vat_category,
    entry_label,
    line_label,
    piece_number,
    document_number,
    invoice_number,
    debit,
    credit,
    net_amount,
    probable_cause
FROM flags
WHERE vat_category = 'UNMAPPED'
   OR journal_code = 'OD'
   OR ABS(net_amount) > 1000  -- seuil paramétrable cabinet
ORDER BY entry_date, journal_code, account_number;
```


## J. Cadrage cumulatif exercice (antériorité du 1er jour de l’exercice)

```sql
WITH declared_ytd AS (
    SELECT
        vd.company_id,
        SUM(COALESCE(vd.declared_amount, vd.net_vat_due, vd.amount_due, 0)) AS declared_amount_ytd
    FROM vat_declarations vd
    WHERE vd.company_id = :company_id
      AND COALESCE(vd.period_start, vd.from_date) >= :fiscal_year_start
      AND COALESCE(vd.period_end, vd.to_date) <= :period_end
),
gl_ytd AS (
    SELECT
        COALESCE(m.vat_category, 'UNMAPPED') AS vat_category,
        SUM(
            CASE
                WHEN m.direction = 'DEBIT' THEN COALESCE(gl.debit,0)
                WHEN m.direction = 'CREDIT' THEN COALESCE(gl.credit,0)
                ELSE COALESCE(gl.debit,0) - COALESCE(gl.credit,0)
            END * COALESCE(m.sign_factor,1)
        ) AS amount
    FROM general_ledger gl
    LEFT JOIN vat_account_mapping m
      ON m.company_id = gl.company_id
     AND COALESCE(gl.account_number, gl.general_account_number) LIKE CONCAT(m.account_prefix, '%')
     AND m.is_active = TRUE
     AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) >= m.valid_from
     AND (m.valid_to IS NULL OR COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) <= m.valid_to)
    WHERE gl.company_id = :company_id
      AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) BETWEEN :fiscal_year_start AND :period_end
      AND COALESCE(gl.account_number, gl.general_account_number) LIKE '445%'
    GROUP BY COALESCE(m.vat_category, 'UNMAPPED')
),
vat_theoretical_ytd AS (
    SELECT
        SUM(CASE WHEN vat_category = 'COLLECTEE' THEN amount ELSE 0 END)
      - SUM(CASE WHEN vat_category IN ('DED_ABS','DED_IMMO') THEN amount ELSE 0 END)
      + SUM(CASE WHEN vat_category = 'DUE_AUTOLIQ' THEN amount ELSE 0 END)
      - SUM(CASE WHEN vat_category = 'DED_AUTOLIQ' THEN amount ELSE 0 END)
      - SUM(CASE WHEN vat_category = 'CREDIT_ANTERIEUR' THEN amount ELSE 0 END)
      + SUM(CASE WHEN vat_category = 'REGULARISATION_TVA' THEN amount ELSE 0 END)
      AS vat_theoretical_amount_ytd
    FROM gl_ytd
)
SELECT
    d.company_id,
    d.declared_amount_ytd,
    t.vat_theoretical_amount_ytd,
    (d.declared_amount_ytd - t.vat_theoretical_amount_ytd) AS cadrage_gap_ytd
FROM declared_ytd d
CROSS JOIN vat_theoretical_ytd t;
```

## K. Analyse client (concentration TVA collectée / risque dossier)

```sql
WITH sales_vat AS (
    SELECT
        gl.company_id,
        COALESCE(gl.customer_id, gl.counterparty_id) AS client_id,
        COALESCE(gl.customer_name, gl.third_party_name, 'CLIENT_NON_RENSEIGNE') AS client_name,
        COALESCE(gl.account_number, gl.general_account_number) AS account_number,
        COALESCE(gl.credit,0) - COALESCE(gl.debit,0) AS vat_collectee_line
    FROM general_ledger gl
    WHERE gl.company_id = :company_id
      AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) BETWEEN :fiscal_year_start AND :period_end
      AND COALESCE(gl.account_number, gl.general_account_number) LIKE '44571%'
)
SELECT
    client_id,
    client_name,
    SUM(vat_collectee_line) AS vat_collectee_ytd,
    ROUND(100 * SUM(vat_collectee_line) / NULLIF(SUM(SUM(vat_collectee_line)) OVER (), 0), 2) AS share_pct
FROM sales_vat
GROUP BY client_id, client_name
ORDER BY vat_collectee_ytd DESC
FETCH FIRST 20 ROWS ONLY;
```

## L. Détection PCA / FAE impact TVA (contrôles de cut-off)

```sql
SELECT
    COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) AS entry_date,
    gl.journal_code,
    COALESCE(gl.account_number, gl.general_account_number) AS account_number,
    gl.entry_label,
    gl.line_label,
    gl.piece_number,
    gl.document_number,
    COALESCE(gl.debit,0) AS debit,
    COALESCE(gl.credit,0) AS credit,
    CASE
        WHEN COALESCE(gl.account_number, gl.general_account_number) LIKE '486%' THEN 'PCA (charges constatées d'avance)'
        WHEN COALESCE(gl.account_number, gl.general_account_number) LIKE '4181%'
          OR COALESCE(gl.account_number, gl.general_account_number) LIKE '4188%' THEN 'FAE (factures à établir)'
        ELSE 'AUTRE_CUTOFF'
    END AS cutoff_type
FROM general_ledger gl
WHERE gl.company_id = :company_id
  AND COALESCE(gl.entry_date, gl.accounting_date, gl.posting_date) BETWEEN :fiscal_year_start AND :period_end
  AND (
        COALESCE(gl.account_number, gl.general_account_number) LIKE '486%'
     OR COALESCE(gl.account_number, gl.general_account_number) LIKE '4181%'
     OR COALESCE(gl.account_number, gl.general_account_number) LIKE '4188%'
     OR UPPER(COALESCE(gl.entry_label,'')) LIKE '%PCA%'
     OR UPPER(COALESCE(gl.entry_label,'')) LIKE '%FAE%'
      )
ORDER BY entry_date;
```

---

# Tableau final

## Format de restitution conseillé (vue `vat_cadrage_report`)

Colonnes minimales :

- `company_id` / `company_name`
- `period_start`
- `period_end`
- `form_type`
- `declaration_id`
- `declared_amount`
- `paid_amount` (si dispo)
- `declaration_status`
- `vat_theoretical_amount` (période)
- `vat_theoretical_amount_ytd` (du 1er jour de l'exercice à `period_end`)
- `declared_amount_ytd`
- `cadrage_gap` (période)
- `cadrage_gap_ytd`
- `gap_rate_pct` (écart / déclaré)
- `top_unmapped_accounts`
- `top_od_entries`
- `top_clients_vat_collectee`
- `top_cutoff_entries_pca_fae`
- `comments_probable_causes`

## Exemple d’usage cabinet

- **Collaborateur** : contrôle premier niveau (écart global + comptes non mappés).
- **Chef de mission** : revue des causes (OD, autoliquidation, décalages).
- **Responsable portefeuille** : pilotage qualité multi-dossiers (KPI écart absolu/relatif).

---

# Points de vigilance

1. **Noms de champs Pennylane variables** selon extraction (API brute vs data warehouse). Toujours valider un dictionnaire de données en amont.
2. **Cases CA3 détaillées** : pas toujours disponibles en granularité ligne/case dans les tables standards ; si absent, faire un cadrage global fiable + détail GL.
3. **TVA sur encaissements / comptabilité de trésorerie** :
   - le cadrage strict période comptable peut diverger de la période déclarative,
   - il faut une logique complémentaire basée sur encaissements/décaissements et lettrage facture-paiement.
4. **Décalages de période** : FNP/FAE, OD de cut-off, déclarations rectificatives.
5. **Écritures directes 445** sans pièce source : à isoler systématiquement.
6. **Avoirs et régularisations** : vérifier la bonne imputation catégorie et la période de prise en compte.
7. **PCA / FAE** : contrôler la date d’exigibilité TVA vs date de comptabilisation de cut-off.
8. **Analyse client** : si le tiers n’est pas renseigné sur les lignes GL, l’analyse de concentration devient partielle.

---

# Recommandations de mise en œuvre

## 1) SQL direct (démarrage rapide)

- Créer la table `vat_account_mapping`.
- Créer 3 vues :
  - `vw_vat_declared` (déclaration + statut paiement)
  - `vw_vat_gl_classified` (GL 445 + mapping)
  - `vw_vat_cadrage` (comparaison + écart)
- Ajouter une requête d’audit `vw_vat_anomalies` (OD, unmapped, seuil).

## 2) Power BI (industrialisation cabinet)

- Modèle étoile :
  - Faits : `general_ledger`, `vat_declarations`, `tax_declarations`
  - Dimensions : `dim_company`, `dim_period`, `dim_vat_mapping`
- Mesures DAX :
  - `TVA_GL_Theorique`
  - `TVA_Declaree`
  - `Ecart_TVA`
  - `%Ecart`
- Visuels clés :
  - KPI écart global
  - matrice par catégorie TVA
  - tableau des écritures explicatives
  - segmentation par dossier/période/collaborateur

## 3) Excel / Power Query (mode équipe terrain)

- Requêtes Power Query paramétrées (`company_id`, dates).
- Onglets :
  - `01_Declaration`
  - `02_GL_445`
  - `03_Mapping`
  - `04_Cadrage`
  - `05_Anomalies`
- Mettre en forme conditionnelle sur :
  - `|écart| > seuil`
  - comptes `UNMAPPED`
  - journaux `OD`

## 4) Analyse clients / PCA-FAE en pratique

- Ajouter un onglet ou une vue `vw_vat_clients_ytd` (Top 20 clients en TVA collectée YTD).
- Ajouter `vw_vat_cutoff_pca_fae` pour revue chef de mission sur les écritures de cut-off.
- Documenter toute écriture PCA/FAE impactant la TVA dans les commentaires de cadrage.

## 5) Gouvernance

- Valider le mapping avec le chef de mission à l’onboarding dossier.
- Versionner le mapping (date effet + auteur modif).
- Poser un seuil d’alerte : ex. écart absolu > 100 € ou > 2 %.

