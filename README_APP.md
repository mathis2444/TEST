# Cadrage TVA – Web local (sans Python)

## Ouverture locale

1. Double-cliquez `web_local/index.html`.
2. La page s’ouvre directement dans le navigateur.

## Mode CSV local

1. Chargez `vat_declarations.csv`.
2. Chargez `tax_declarations.csv` (optionnel).
3. Chargez `general_ledger.csv`.
4. (Optionnel) chargez `web_local/mapping_template.csv`.
5. Sélectionnez société + période + ouverture exercice.
6. Cliquez **Lancer cadrage**.

## Mode API (proxy sécurisé recommandé)

1. Passez en mode API.
2. Renseignez les endpoints (companies, vat, tax, gl, mapping).
3. Cliquez **Charger sociétés API** puis **Synchroniser API**.
4. Lancez le cadrage.

## Workflow anomalies

- Sélectionnez une action rapide.
- Cliquez **Proposer** sur une ligne.
- Passez le statut en `VALIDATED` ou `APPLIED`.
- Seules les corrections validées/appliquées impactent l’écart ajusté.

## Export Excel (piste d’audit)

L’export contient :
- Parameters
- Summary
- Controls
- ByCategory
- Explanations
- ByAccount445
- Anomalies
- Corrections
- MappingUsed
- RawVatDeclarations
- RawTaxDeclarations
- RawGeneralLedger
- ClassifiedLines

## Limites connues
- Le mode API direct est réservé aux tests locaux.
- Ne pas utiliser de clé API cabinet dans le navigateur.
- Le cadrage TVA repose sur les comptes 445.
- Les régimes TVA sur encaissement et TVA sur marge nécessitent un traitement complémentaire.
- Les corrections proposées ne modifient pas la donnée source.
