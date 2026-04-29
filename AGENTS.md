# AGENTS.md

Règles de développement pour les futures tâches Codex dans ce dépôt.

## Sécurité et données sensibles

- Ne jamais exposer de clé API réelle.
- Ne jamais committer de secrets (`.env`, tokens, identifiants).
- Utiliser `.env.example` avec des placeholders uniquement.

## Règles métier non négociables (V1)

- Ne jamais conclure **FIABLE** pour la **TVA sur marge** sans moteur dédié.
- Ne jamais conclure **FIABLE** pour la **TVA sur encaissements** sans moteur dédié.
- En V1, ces régimes doivent rester **NON_CONCLUANT**.

## Qualité et tests

- Préserver les tests existants.
- Ajouter des tests pour toute nouvelle règle métier.
- Exécuter `npm test` et `npm run build` avant de proposer un changement.

## Architecture

- Garder le moteur métier séparé de l’UI.
- Éviter de mélanger logique `src/core/*` avec la couche interface (`src/main.ts`).
- Ne pas modifier la logique métier sans demande explicite.
