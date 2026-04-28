# AGENTS.md

Instructions pour les futures tâches Codex sur ce dépôt.

## Objectifs de stabilité

- Prioriser la stabilité technique et la reproductibilité des commandes.
- Éviter les changements de logique métier sans demande explicite.
- Pour ce projet, la logique métier du cadrage TVA (`src/core/*`) ne doit pas être modifiée sauf instruction claire.

## Workflow recommandé

1. Installer les dépendances avec `npm install`.
2. Vérifier les tests avec `npm test`.
3. Vérifier le build avec `npm run build`.
4. Documenter toute modification côté setup/deploiement dans `README.md`.

## Configuration sensible

- Ne jamais committer de secrets (`.env`, clés API réelles, tokens).
- Utiliser `.env.example` pour exposer uniquement des placeholders.
- Les variables attendues pour l'intégration Pennylane sont :
  - `PENNYLANE_API_BASE_URL`
  - `PENNYLANE_API_KEY`

## Conventions de contribution

- Préférer des changements ciblés et atomiques.
- Ajouter ou mettre à jour des tests si un comportement change.
- Garder les messages de commit explicites.
