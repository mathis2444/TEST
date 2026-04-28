# TVA Reconciliation Framework (build-tva-reconciliation-framework-using-pennylane-data)

## Installation

```bash
npm install
```

## Scripts

```bash
npm run dev
npm run build
npm test
```

## Architecture (moteur séparé)

- `src/core/normalizeColumns.ts`
- `src/core/parseAmounts.ts`
- `src/core/parseDates.ts`
- `src/core/classifyVatLines.ts`
- `src/core/computeVatReconciliation.ts`
- `src/core/detectAnomalies.ts`
- `src/core/applyAdjustments.ts`
- `src/core/exportWorkbook.ts`

## UI principale

L’UI TypeScript (`src/main.ts`) supporte :
- mode CSV,
- mode API via proxy,
- affichage contrôles/anomalies,
- tableaux par catégorie et par compte 445,
- export Excel enrichi.

## API mode sécurisé

Le front appelle uniquement `/api/pennylane/*`.
La clé Pennylane reste côté serveur (`PENNYLANE_API_KEY`).

Endpoints whitelistés :
- `/companies`
- `/vat_declarations`
- `/tax_declarations`
- `/general_ledger`
- `/vat_account_mapping`
- `/fiscal_years`

## Limites connues
- Le mode API est local (`npm run dev`) et nécessite un proxy configuré.
- Les régimes TVA sur encaissement/marge restent en `NON_CONCLUANT` (cadrage partiel).
- Les corrections nécessitent revue utilisateur avant statut `VALIDATED/APPLIED`.
- Les corrections ne modifient jamais les données sources.
