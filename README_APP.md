# Cadrage TVA – version Web local (sans Python)

## Démarrage

Ouvrir `web_local/index.html` dans Chrome/Edge.

## Mode 1 — CSV local

1. Chargez `vat_declarations.csv`.
2. Chargez `general_ledger.csv`.
3. (Optionnel) chargez un mapping via `web_local/mapping_template.csv`.
4. Sélectionnez société + période + ouverture exercice.
5. Lancez le cadrage puis exportez en Excel.

## Mode 2 — API (clé API dans l’UI)

1. Saisissez `Base URL API` + `API Key`.
2. Renseignez les endpoints (companies, vat_declarations, general_ledger).
3. Cliquez **Charger depuis API**.
4. Sélectionnez la société puis lancez le cadrage.

> Note: votre API doit autoriser CORS pour un appel direct depuis le navigateur.

## Sorties exportées

- Summary
- ByCategory
- ByAccount445
- Anomalies
- ClientAnalysis
- ClassifiedLines
