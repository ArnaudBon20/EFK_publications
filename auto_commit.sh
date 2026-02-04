#!/bin/bash
# Script pour automatiser les commits et push vers GitHub
# Usage: ./auto_commit.sh "message de commit" (optionnel)

cd "$(dirname "$0")"

# Vérifier s'il y a des changements
if [[ -z $(git status --porcelain) ]]; then
    echo "Aucun changement à commiter."
    exit 0
fi

# Ajouter tous les fichiers modifiés
git add .

# Message de commit (utilise l'argument ou un message par défaut avec timestamp)
if [ -z "$1" ]; then
    COMMIT_MSG="Auto-update: $(date '+%Y-%m-%d %H:%M:%S')"
else
    COMMIT_MSG="$1"
fi

# Commit et push
git commit -m "$COMMIT_MSG"
git push origin main

echo "Changements poussés vers GitHub avec succès!"
