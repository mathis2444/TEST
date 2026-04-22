# App opérationnelle de cadrage TVA

## Lancer

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Pré-requis données (dans le fichier DuckDB)

Tables minimales :
- `vat_declarations`
- `general_ledger`

Optionnelle :
- `tax_declarations`

## Utilisation

1. Renseigner le chemin du fichier `.duckdb` et cliquer **Ouvrir le dossier**.
2. Sélectionner la société, la période et la date d'ouverture d'exercice.
3. Cliquer **Lancer le cadrage**.
4. Télécharger le fichier via **Export Excel du cadrage**.

## Résultats exportés

- Summary
- ByCategory
- ByAccount445
- Anomalies
- ClientAnalysis
- ClassifiedLines

