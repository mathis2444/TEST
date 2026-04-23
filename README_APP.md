# Cadrage TVA – 2 modes d'utilisation

## Mode A (Python / Streamlit)

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Mode B (Web local sans Python)

Ouvrir directement `web_local/index.html` dans votre navigateur (Chrome/Edge).

- Chargez `vat_declarations.csv`.
- Chargez `general_ledger.csv`.
- (Optionnel) chargez `mapping.csv` en partant de `web_local/mapping_template.csv`.
- Lancez le cadrage.
- Exportez le fichier Excel.

## Pré-requis données

Tables/CSV minimales :
- `vat_declarations`
- `general_ledger`

Optionnelle :
- `tax_declarations`

## Résultats exportés

- Summary
- ByCategory
- ByAccount445
- Anomalies
- ClientAnalysis
- ClassifiedLines
