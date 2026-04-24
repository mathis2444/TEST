# Cadrage TVA – Web local (sans Python)

## Démarrage

Ouvrir `web_local/index.html` dans Chrome/Edge.

## Mode 1 — CSV local

1. Chargez `vat_declarations.csv`.
2. Chargez `general_ledger.csv`.
3. (Optionnel) chargez un mapping via `web_local/mapping_template.csv`.
4. Sélectionnez société + période + ouverture exercice.
5. Lancez le cadrage puis exportez en Excel.

## Mode 2 — API (clé API mémorisée 1 fois)

1. Passez en mode API.
2. Saisissez `Base URL API` + `API Key` + endpoints.
3. Laissez cochée l’option **Mémoriser la config API (1 seule fois)**.
4. Cliquez **Enregistrer config API** (stockage `localStorage` navigateur).
5. Cliquez **Charger sociétés API**, sélectionnez la société, puis **Synchroniser données API**.
6. Lancez le cadrage et exportez en Excel.

> Note: l’API doit autoriser CORS pour un appel direct depuis le navigateur.

## Sorties exportées

- Summary
- ByCategory
- ByAccount445
- Anomalies
- ClientAnalysis
- ClassifiedLines
