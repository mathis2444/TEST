# TVA Reconciliation Framework (POC)

Ce projet est une preuve de concept de cadrage TVA (VAT reconciliation) basée sur des exports comptables et déclaratifs.

## Prérequis

- Node.js 20+ (recommandé)
- npm 10+

Vérifier votre environnement :

```bash
node -v
npm -v
```

## Installation

```bash
npm install
```

## Configuration

1. Copier le fichier d'exemple d'environnement.
2. Renseigner les variables Pennylane.

```bash
cp .env.example .env
```

Variables attendues :

- `PENNYLANE_API_BASE_URL` : URL de base de l'API Pennylane (ex: `https://api.pennylane.com`)
- `PENNYLANE_API_KEY` : clé API Pennylane (ne pas committer)

> Le proxy Vite lit ces variables via `vite.config.ts`.

## Lancer l'application en local

```bash
npm run dev
```

Puis ouvrir l'URL affichée par Vite (par défaut `http://localhost:5173`).

## Vérifications projet

### Tests unitaires

```bash
npm test
```

### Build de production

```bash
npm run build
```

## Documentation complémentaire

- `README_APP.md` : guide fonctionnel rapide
- `TVA_CADRAGE_PENNYLANE.md` : cadrage détaillé et méthodologie
