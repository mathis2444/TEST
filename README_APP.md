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

## Architecture

Le moteur est séparé de l'interface :

- `src/core/normalizeColumns.ts`
- `src/core/parseAmounts.ts`
- `src/core/parseDates.ts`
- `src/core/classifyVatLines.ts`
- `src/core/computeVatReconciliation.ts`
- `src/core/detectAnomalies.ts`
- `src/core/applyAdjustments.ts`
- `src/core/exportWorkbook.ts`

## API mode sécurisé

Le front appelle uniquement `/api/pennylane/*`.
La clé Pennylane doit rester côté serveur (`PENNYLANE_API_KEY`).

Endpoints whitelistés :
- `/companies`
- `/vat_declarations`
- `/tax_declarations`
- `/general_ledger`
- `/vat_account_mapping`
- `/fiscal_years`

## Limites connues
- Le mode API direct est réservé aux tests locaux via `npm run dev`.
- Le cadrage TVA repose sur les comptes 445.
- Les régimes TVA sur encaissement et TVA sur marge nécessitent un traitement complémentaire.
- Les corrections proposées ne modifient pas la donnée source.
