# Cadrage TVA – Web local (sans Python)

## Ouverture locale

1. Double-cliquez `web_local/index.html`.
2. La page s’ouvre directement dans le navigateur (Chrome/Edge/Firefox).

## Mode CSV local

1. Chargez `vat_declarations.csv`.
2. Chargez `general_ledger.csv`.
3. (Optionnel) chargez `web_local/mapping_template.csv`.
4. Sélectionnez société + période + ouverture exercice.
5. Cliquez **Lancer le cadrage**.

## Mode API (clé API saisie 1 fois)

1. Passez en mode API.
2. Saisissez Base URL + API Key + endpoints.
3. Cliquez **Enregistrer API** (stocké dans `localStorage`).
4. Cliquez **Charger sociétés API** puis **Synchroniser API**.
5. Lancez le cadrage.

## Correction rapide des anomalies

- Utilisez le **Centre d'anomalies** pour filtrer les lignes.
- Choisissez une action rapide (`EXCLUDE_LINE`, `SIGN_INVERT`, `REMAP_*`).
- Cliquez **Corriger** sur la ligne concernée.
- Le KPI **Écart ajusté** se met à jour immédiatement.

## Export Excel

Cliquez **Export Excel** pour générer :
- Summary
- ByCategory
- ByAccount445
- Anomalies
- ClientAnalysis
- Corrections
- ClassifiedLines
