#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACK_TAG="clos-de-la-reine-back:$TIMESTAMP"
FRONT_TAG="clos-de-la-reine-front:$TIMESTAMP"
BACK_LATEST="clos-de-la-reine-back:latest"
FRONT_LATEST="clos-de-la-reine-front:latest"

IMAGES_DIR="$PROJECT_ROOT/Images"
mkdir -p "$IMAGES_DIR"
chmod 755 "$IMAGES_DIR" 2>/dev/null || true

TEMP_BACK_TAR="/tmp/clos-de-la-reine-back-$$.tar"
TEMP_FRONT_TAR="/tmp/clos-de-la-reine-front-$$.tar"

cleanup_on_error() {
    echo ""
    echo "❌ Erreur lors du déploiement !"
    echo "🧹 Nettoyage des fichiers temporaires..."
    sudo rm -f "$TEMP_BACK_TAR" "$TEMP_FRONT_TAR" 2>/dev/null || true
    exit 1
}

trap cleanup_on_error ERR

echo "🔨 Étape 1/4 : Build des images Docker avec versioning..."

echo "  → Build backend (tag: $BACK_TAG)..."
if [ -d "Backend" ]; then
    cd Backend
elif [ -d "backend" ]; then
    cd backend
else
    echo "❌ Dossier backend/Backend introuvable"
    exit 1
fi

# Compiler le code source avant de construire l'image Docker
echo "    Compilation du backend..."
npm run build || {
    echo "❌ Erreur lors de la compilation du backend"
    exit 1
}

sudo docker build --no-cache -t "$BACK_TAG" -t "$BACK_LATEST" . || {
    echo "❌ Erreur lors du build du backend"
    exit 1
}
cd ..

echo "  → Build frontend (tag: $FRONT_TAG)..."
cd Frontend
echo "    Compilation du frontend..."
npm run build || {
    echo "❌ Erreur lors de la compilation du frontend"
    exit 1
}
sudo docker build --no-cache -t "$FRONT_TAG" -t "$FRONT_LATEST" . || {
    echo "❌ Erreur lors du build du frontend"
    exit 1
}
cd ..

echo "📦 Étape 2/4 : Export et import des images dans K3s..."

echo "  → Suppression des anciennes images..."
rm -f "$IMAGES_DIR"/k3s-clos-de-la-reine-back*.tar "$IMAGES_DIR"/k3s-clos-de-la-reine-front*.tar 2>/dev/null || true

TEMP_BACK_TAR="/tmp/clos-de-la-reine-back-$$.tar"
TEMP_FRONT_TAR="/tmp/clos-de-la-reine-front-$$.tar"

echo "  → Export backend..."
sudo docker save "$BACK_TAG" -o "$TEMP_BACK_TAR" || {
    echo "❌ Erreur lors de l'export du backend"
    exit 1
}

echo "  → Export frontend..."
sudo docker save "$FRONT_TAG" -o "$TEMP_FRONT_TAR" || {
    echo "❌ Erreur lors de l'export du frontend"
    exit 1
}

echo "  → Import backend dans K3s..."
sudo k3s ctr images import "$TEMP_BACK_TAR" || {
    echo "❌ Erreur lors de l'import du backend"
    exit 1
}

echo "  → Import frontend dans K3s..."
sudo k3s ctr images import "$TEMP_FRONT_TAR" || {
    echo "❌ Erreur lors de l'import du frontend"
    exit 1
}

echo "📋 Étape 3/4 : Mise à jour des configurations K3s..."

sed -i.bak "s|image: clos-de-la-reine-back:.*|image: $BACK_TAG|g" K3s/clos-de-la-reine_back.yaml
sed -i.bak "s|image: clos-de-la-reine-front:.*|image: $FRONT_TAG|g" K3s/clos-de-la-reine_front.yaml

echo "  → Application de la configuration backend..."
kubectl apply -f K3s/clos-de-la-reine_back.yaml || {
    echo "❌ Erreur lors de l'application de la configuration backend"
    exit 1
}

echo "  → Application de la configuration frontend..."
kubectl apply -f K3s/clos-de-la-reine_front.yaml || {
    echo "❌ Erreur lors de l'application de la configuration frontend"
    exit 1
}

rm -f K3s/clos-de-la-reine_back.yaml.bak K3s/clos-de-la-reine_front.yaml.bak || true

echo "⏳ Étape 4/4 : Attente de la disponibilité des nouveaux pods..."

echo "  → Vérification du déploiement backend..."
if ! kubectl rollout status deployment/clos-de-la-reine-back -n clos-de-la-reine --timeout=300s; then
    echo "❌ Le déploiement backend a échoué"
    echo "🔍 Vérification des pods..."
    kubectl get pods -n clos-de-la-reine -l app=clos-de-la-reine-back
    echo "🔍 Logs du dernier pod..."
    NEW_POD=$(kubectl get pods -n clos-de-la-reine -l app=clos-de-la-reine-back --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1].metadata.name}' 2>/dev/null)
    if [ -n "$NEW_POD" ]; then
        kubectl logs -n clos-de-la-reine "$NEW_POD" --tail=50 || true
        kubectl describe pod -n clos-de-la-reine "$NEW_POD" | grep -A 10 "Events:" || true
    fi
    echo "🔄 Rollback en cours..."
    kubectl rollout undo deployment/clos-de-la-reine-back -n clos-de-la-reine || true
    exit 1
fi

echo "  → Vérification du déploiement frontend..."
if ! kubectl rollout status deployment/clos-de-la-reine-front -n clos-de-la-reine --timeout=180s; then
    echo "❌ Le déploiement frontend a échoué"
    echo "🔄 Rollback en cours..."
    kubectl rollout undo deployment/clos-de-la-reine-front -n clos-de-la-reine || true
    exit 1
fi

echo "🧹 Nettoyage des anciens replicasets..."
kubectl get replicaset -n clos-de-la-reine --no-headers 2>/dev/null | while read line; do
    rs=$(echo "$line" | awk '{print $1}' | sed 's/replicaset\.apps\///')
    desired=$(echo "$line" | awk '{print $2}')
    current=$(echo "$line" | awk '{print $3}')
    ready=$(echo "$line" | awk '{print $4}')
    if [ "$desired" = "0" ] && [ "$current" = "0" ] && [ "$ready" = "0" ]; then
        kubectl delete replicaset "$rs" -n clos-de-la-reine --ignore-not-found=true 2>/dev/null || true
    fi
done

echo "🧹 Nettoyage des anciennes images Docker..."
OLD_IMAGES=$(sudo docker images | grep -E "clos-de-la-reine-(back|front)" | grep -v "$TIMESTAMP" | grep -v "latest" | awk '{print $1":"$2}' || true)
if [ -n "$OLD_IMAGES" ]; then
    echo "$OLD_IMAGES" | while read img; do
        if [ -n "$img" ]; then
            echo "  → Suppression de l'ancienne image: $img"
            sudo docker rmi "$img" 2>/dev/null || true
        fi
    done
fi

echo "💾 Export des images K3s vers Images/..."
ALL_IMAGES=$(sudo k3s ctr images list 2>/dev/null)
BACK_IMAGE_NAME=$(echo "$ALL_IMAGES" | grep -i "clos.*reine.*back" | grep "$TIMESTAMP" | awk '{print $1}' | head -1)
if [ -z "$BACK_IMAGE_NAME" ]; then
    BACK_IMAGE_NAME=$(echo "$ALL_IMAGES" | grep -i "clos.*reine.*back" | grep -i "latest" | awk '{print $1}' | head -1)
fi

FRONT_IMAGE_NAME=$(echo "$ALL_IMAGES" | grep -i "clos.*reine.*front" | grep "$TIMESTAMP" | awk '{print $1}' | head -1)
if [ -z "$FRONT_IMAGE_NAME" ]; then
    FRONT_IMAGE_NAME=$(echo "$ALL_IMAGES" | grep -i "clos.*reine.*front" | grep -i "latest" | awk '{print $1}' | head -1)
fi

if [ -n "$BACK_IMAGE_NAME" ]; then
    echo "  → Export backend: $BACK_IMAGE_NAME"
    if sudo k3s ctr images export "$IMAGES_DIR/k3s-clos-de-la-reine-back.tar" "$BACK_IMAGE_NAME" 2>&1 | grep -v "exporting\|exported"; then
        if [ -f "$IMAGES_DIR/k3s-clos-de-la-reine-back.tar" ]; then
            sudo chown $USER:$USER "$IMAGES_DIR/k3s-clos-de-la-reine-back.tar" 2>/dev/null || true
            echo "  ✅ Image backend exportée"
        else
            echo "  ⚠️  Fichier non créé"
        fi
    else
        if [ -f "$IMAGES_DIR/k3s-clos-de-la-reine-back.tar" ]; then
            sudo chown $USER:$USER "$IMAGES_DIR/k3s-clos-de-la-reine-back.tar" 2>/dev/null || true
            echo "  ✅ Image backend exportée"
        else
            echo "  ⚠️  Erreur lors de l'export backend"
        fi
    fi
else
    echo "  ⚠️  Image backend non trouvée dans K3s"
    echo "  Debug: $(echo "$ALL_IMAGES" | grep -i "clos" | head -3)"
fi

if [ -n "$FRONT_IMAGE_NAME" ]; then
    echo "  → Export frontend: $FRONT_IMAGE_NAME"
    if sudo k3s ctr images export "$IMAGES_DIR/k3s-clos-de-la-reine-front.tar" "$FRONT_IMAGE_NAME" 2>&1 | grep -v "exporting\|exported"; then
        if [ -f "$IMAGES_DIR/k3s-clos-de-la-reine-front.tar" ]; then
            sudo chown $USER:$USER "$IMAGES_DIR/k3s-clos-de-la-reine-front.tar" 2>/dev/null || true
            echo "  ✅ Image frontend exportée"
        else
            echo "  ⚠️  Fichier non créé"
        fi
    else
        if [ -f "$IMAGES_DIR/k3s-clos-de-la-reine-front.tar" ]; then
            sudo chown $USER:$USER "$IMAGES_DIR/k3s-clos-de-la-reine-front.tar" 2>/dev/null || true
            echo "  ✅ Image frontend exportée"
        else
            echo "  ⚠️  Erreur lors de l'export frontend"
        fi
    fi
else
    echo "  ⚠️  Image frontend non trouvée dans K3s"
    echo "  Debug: $(echo "$ALL_IMAGES" | grep -i "clos" | head -3)"
fi

echo "🧹 Nettoyage des anciennes images K3s..."
OLD_BACK_IMAGES=$(echo "$ALL_IMAGES" | grep -i "clos.*reine.*back" | grep -v "$TIMESTAMP" | grep -v "latest" | awk '{print $1}' || true)
if [ -n "$OLD_BACK_IMAGES" ]; then
    echo "$OLD_BACK_IMAGES" | while read img; do
        if [ -n "$img" ]; then
            echo "  → Suppression: $img"
            sudo k3s ctr images rm "$img" 2>/dev/null || true
        fi
    done
fi

OLD_FRONT_IMAGES=$(echo "$ALL_IMAGES" | grep -i "clos.*reine.*front" | grep -v "$TIMESTAMP" | grep -v "latest" | awk '{print $1}' || true)
if [ -n "$OLD_FRONT_IMAGES" ]; then
    echo "$OLD_FRONT_IMAGES" | while read img; do
        if [ -n "$img" ]; then
            echo "  → Suppression: $img"
            sudo k3s ctr images rm "$img" 2>/dev/null || true
        fi
    done
fi

echo "🧹 Nettoyage des fichiers temporaires..."
sudo rm -f "$TEMP_BACK_TAR" "$TEMP_FRONT_TAR" 2>/dev/null || true

echo ""
echo "✅ Déploiement terminé avec succès !"
echo "📌 Versions déployées:"
echo "   - Backend: $BACK_TAG"
echo "   - Frontend: $FRONT_TAG"
echo ""
echo "💡 Pour revenir à une version précédente, utilisez:"
echo "   kubectl rollout undo deployment/clos-de-la-reine-back -n clos-de-la-reine"
echo "   kubectl rollout undo deployment/clos-de-la-reine-front -n clos-de-la-reine"
