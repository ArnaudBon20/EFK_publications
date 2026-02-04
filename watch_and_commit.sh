#!/bin/bash
# Surveille les fichiers .js et auto-commit vers GitHub
# Usage: ./watch_and_commit.sh (en arrière-plan)

cd "$(dirname "$0")"

echo "🔍 Surveillance des fichiers .js activée..."
echo "   Les changements seront automatiquement poussés vers GitHub"
echo "   Ctrl+C pour arrêter"

fswatch -o *.js | while read -r; do
    sleep 2  # Attendre que le fichier soit complètement sauvegardé
    
    if [[ -n $(git status --porcelain) ]]; then
        echo ""
        echo "📝 Changement détecté - $(date '+%H:%M:%S')"
        git add .
        git commit -m "Auto-update: $(date '+%Y-%m-%d %H:%M:%S')"
        git push origin main
        echo "✅ Poussé vers GitHub"
    fi
done
