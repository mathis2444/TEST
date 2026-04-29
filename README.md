# Outil de cadrage TVA (V1)

## Objectif de l’application

Cette application aide un cabinet comptable à réaliser un cadrage TVA à partir de données issues de Pennylane.
La V1 est volontairement limitée à une approche fiable sur la **TVA sur les débits**.

Les cas **TVA sur encaissements** et **TVA sur marge** ne sont pas traités par un moteur dédié dans cette version : ils doivent rester en statut **NON_CONCLUANT**.

## Installation

Prérequis :

- Node.js 20+
- npm 10+

Installation des dépendances :

```bash
npm install
```

## Configuration environnement

Copier le fichier d’exemple puis renseigner les variables :

```bash
cp .env.example .env
```

Variables attendues :

- `PENNYLANE_API_BASE_URL` (ex: `https://api.pennylane.com`)
- `PENNYLANE_API_KEY` (clé locale, jamais commitée)

## Lancement local

```bash
npm run dev
```

Puis ouvrir l’URL affichée par Vite (généralement `http://localhost:5173`).

## Mode CSV

Le mode CSV permet de tester le cadrage à partir de fichiers locaux (grand livre, déclarations, mapping), sans appel API.

Étapes recommandées :

1. Lancer l’application avec `npm run dev`.
2. Charger les fichiers CSV d’exemple depuis `tests/` ou vos exports.
3. Vérifier la synthèse de cadrage et les anomalies détectées.

## Mode API

Le mode API passe par le proxy local Vite (`/api/pennylane/*`) configuré par `vite.config.ts`.

Étapes recommandées :

1. Renseigner `.env` avec `PENNYLANE_API_BASE_URL` et `PENNYLANE_API_KEY`.
2. Lancer `npm run dev`.
3. Utiliser le workflow API dans l’interface.

## Limites connues (V1)

- Périmètre orienté **TVA sur les débits**.
- **TVA sur encaissements** : statut attendu **NON_CONCLUANT** tant qu’un moteur dédié n’existe pas.
- **TVA sur marge** : statut attendu **NON_CONCLUANT** tant qu’un moteur dédié n’existe pas.
- Les résultats dépendent de la qualité des exports comptables et du mapping fourni.

## Commandes npm

- `npm run dev` : démarrer l’application en local.
- `npm test` : lancer les tests Vitest.
- `npm run build` : produire le build de production.

## Documentation complémentaire

- `README_APP.md` : guide fonctionnel rapide.
- `TVA_CADRAGE_PENNYLANE.md` : cadrage détaillé et méthodologie.
- `TVA_ENCAISSEMENTS_EXPERIMENTAL.md` : périmètre et données requises pour la V1 expérimentale encaissements.


## Architecture Front / Backend

- **Front**: application Vite (`npm run dev`) qui consomme uniquement `/api/pennylane/*`.
- **Backend**: serveur Node dédié (`npm run dev:api`) qui porte la logique d'accès Pennylane (`src/server/pennylaneClient.js`) et garde les variables d'environnement côté serveur.

Démarrage local recommandé (2 terminaux):

```bash
npm run dev:api
npm run dev
```


> Le script `npm run dev:api` charge automatiquement `.env` via `node --env-file=.env`.
