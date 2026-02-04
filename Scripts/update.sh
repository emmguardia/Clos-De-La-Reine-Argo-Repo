#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_DIR="$PROJECT_ROOT/Logs"
mkdir -p "$LOG_DIR"
LOG_FILE=""
LATEST_LOG="$LOG_DIR/latest.log"

DRY_RUN=false
SKIP_TESTS=false
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        *)
            echo "Usage: $0 [--dry-run] [--skip-tests] [--skip-build]"
            echo ""
            echo "Options:"
            echo "  --dry-run      Affiche ce qui sera fait sans l'exécuter"
            echo "  --skip-tests   Ignore les tests avant le déploiement"
            echo "  --skip-build   Ignore les builds (utile si déjà compilé)"
            exit 1
            ;;
    esac
done

cleanup_on_error() {
    echo ""
    echo "❌ Erreur lors du processus de mise à jour !"
    echo "🧹 Nettoyage en cours..."
    exit 1
}

trap cleanup_on_error ERR

init_log() {
    if [ -z "$LOG_FILE" ]; then
        LOG_FILE="$LOG_DIR/update-deploy-$TIMESTAMP.log"
        log_info "=== Démarrage du processus de mise à jour et déploiement ==="
        if [ -t 0 ]; then
            log_info "Déclenchement: MANUEL"
        else
            log_info "Déclenchement: AUTOMATIQUE (cron/scheduled)"
        fi
        log_info "Mode: $([ "$DRY_RUN" = true ] && echo "DRY-RUN" || echo "EXÉCUTION")"
        log_info "Log: $LOG_FILE"
        ln -sf "$(basename "$LOG_FILE")" "$LATEST_LOG" 2>/dev/null || true
    fi
}

log() {
    if [ -n "$LOG_FILE" ]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
    fi
}

log_error() {
    echo "❌ $1" >&2
    if [ -n "$LOG_FILE" ]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1" >> "$LOG_FILE"
    fi
}

log_success() {
    echo "✅ $1"
    if [ -n "$LOG_FILE" ]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1" >> "$LOG_FILE"
    fi
}

log_info() {
    if [ -n "$LOG_FILE" ]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $1" >> "$LOG_FILE"
    fi
}

check_prerequisites() {
    log_info "Vérification des prérequis..."
    
    if ! command -v npm &> /dev/null; then
        log_error "npm n'est pas installé"
        exit 1
    fi
    
    if ! command -v ncu &> /dev/null; then
        log_info "Installation de npm-check-updates..."
        npm install -g npm-check-updates >/dev/null 2>&1 || {
            log_error "Impossible d'installer npm-check-updates"
            exit 1
        }
    fi
    
    log_info "Prérequis vérifiés"
}

update_packages() {
    local DIR=$1
    local NAME=$2
    
    cd "$PROJECT_ROOT/$DIR"
    
    if [ "$DRY_RUN" = true ]; then
        ncu >/dev/null 2>&1 || true
        return 0
    fi
    
    OLD_PACKAGE_JSON=$(cat package.json)
    
    AVAILABLE_UPDATES=$(ncu 2>&1 | grep -E "^\s+[a-zA-Z0-9@/_.-]+\s+[^→]+→" || true)
    
    if [ -z "$AVAILABLE_UPDATES" ]; then
        return 2
    fi
    
    ncu -u >/dev/null 2>&1 || true
    
    NEW_PACKAGE_JSON=$(cat package.json)
    
    if [ "$OLD_PACKAGE_JSON" = "$NEW_PACKAGE_JSON" ]; then
        return 2
    fi
    
    init_log
    log_info "Mise à jour des packages dans $NAME..."
    log_info "Packages mis à jour:"
    echo "$AVAILABLE_UPDATES" | while IFS= read -r line; do
        if [ -n "$line" ]; then
            CLEANED_LINE=$(echo "$line" | sed 's/^[[:space:]]*//')
            log_info "  $CLEANED_LINE"
        fi
    done
    
    log_info "Installation des nouvelles versions..."
    
    npm install --silent >/dev/null 2>&1 || {
        log_error "Erreur lors de l'installation des packages"
        return 1
    }
    
    log_success "Packages mis à jour pour $NAME"
    
    cd "$PROJECT_ROOT"
    return 0
}

check_vulnerabilities() {
    local DIR=$1
    local NAME=$2
    
    log_info "Vérification des vulnérabilités pour $NAME..."
    
    cd "$PROJECT_ROOT/$DIR"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Vérifierait les vulnérabilités"
        return 0
    fi
    
    if npm audit --audit-level=moderate >/dev/null 2>&1; then
        log_info "Aucune vulnérabilité modérée ou critique trouvée pour $NAME"
    else
        log_error "Vulnérabilités trouvées pour $NAME"
        read -p "Continuer quand même ? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return 1
        fi
    fi
    
    cd "$PROJECT_ROOT"
}

run_tests() {
    local DIR=$1
    local NAME=$2
    
    if [ "$SKIP_TESTS" = true ]; then
        log_info "Tests ignorés pour $NAME (--skip-tests)"
        return 0
    fi
    
    log_info "Exécution des tests pour $NAME..."
    
    cd "$PROJECT_ROOT/$DIR"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Exécuterait les tests"
        return 0
    fi
    
    if npm run test 2>/dev/null; then
        log_success "Tests réussis pour $NAME"
    else
        if [ -f "package.json" ] && grep -q '"test"' package.json; then
            log_error "Les tests ont échoué pour $NAME"
            return 1
        else
            log_info "Aucun script de test trouvé pour $NAME"
        fi
    fi
    
    cd "$PROJECT_ROOT"
}

build_project() {
    local DIR=$1
    local NAME=$2
    
    if [ "$SKIP_BUILD" = true ]; then
        log_info "Build ignoré pour $NAME (--skip-build)"
        return 0
    fi
    
    log_info "Compilation de $NAME..."
    
    cd "$PROJECT_ROOT/$DIR"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Compilerait $NAME"
        return 0
    fi
    
    if [ "$DIR" = "Frontend" ]; then
        npm run typecheck 2>/dev/null || {
            log_info "Avertissements TypeScript détectés (non bloquant)"
        }
    fi
    
    npm run build || {
        log_error "Erreur lors du build de $NAME"
        return 1
    }
    
    log_success "$NAME compilé avec succès"
    
    cd "$PROJECT_ROOT"
}

deploy() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Exécuterait le déploiement via refresh.sh"
        return 0
    fi
    
    log_info "Déploiement sur le serveur via refresh.sh..."
    
    cd "$PROJECT_ROOT"
    
    if [ ! -f "Scripts/refresh.sh" ]; then
        log_error "Script refresh.sh introuvable dans $PROJECT_ROOT/Scripts/"
        return 1
    fi
    
    if [ ! -x "Scripts/refresh.sh" ]; then
        log_info "Ajout des permissions d'exécution à refresh.sh..."
        chmod +x Scripts/refresh.sh
    fi
    
    DEPLOY_OUTPUT=$(bash Scripts/refresh.sh 2>&1)
    DEPLOY_EXIT=$?
    
    if [ $DEPLOY_EXIT -ne 0 ]; then
        log_error "Erreur lors du déploiement (code: $DEPLOY_EXIT)"
        log_info "Sortie de refresh.sh:"
        echo "$DEPLOY_OUTPUT" | while IFS= read -r line; do
            log_info "  $line"
        done
        return 1
    fi
    
    log_success "Déploiement terminé avec succès"
    return 0
}

main() {
    check_prerequisites
    
    HAS_UPDATES=false
    
    set +e
    update_packages "Frontend" "Frontend"
    FRONTEND_RESULT=$?
    set -e
    
    if [ $FRONTEND_RESULT -eq 0 ]; then
        HAS_UPDATES=true
        init_log
    elif [ $FRONTEND_RESULT -eq 1 ]; then
        log_error "Erreur lors de la mise à jour du Frontend"
        exit 1
    fi
    
    set +e
    update_packages "Backend" "Backend"
    BACKEND_RESULT=$?
    set -e
    
    if [ $BACKEND_RESULT -eq 0 ]; then
        HAS_UPDATES=true
        init_log
    elif [ $BACKEND_RESULT -eq 1 ]; then
        log_error "Erreur lors de la mise à jour du Backend"
        exit 1
    fi
    
    if [ "$HAS_UPDATES" = false ]; then
        echo "✅ Aucune mise à jour disponible"
        exit 0
    fi
    
    log_info "=== Résumé des mises à jour ==="
    log_info "Frontend: $([ $FRONTEND_RESULT -eq 0 ] && echo "Mis à jour" || echo "Aucune mise à jour")"
    log_info "Backend: $([ $BACKEND_RESULT -eq 0 ] && echo "Mis à jour" || echo "Aucune mise à jour")"
    log_info ""
    
    log_info "=== Vérification des vulnérabilités ==="
    check_vulnerabilities "Frontend" "Frontend"
    check_vulnerabilities "Backend" "Backend"
    
    log_info "=== Tests ==="
    run_tests "Frontend" "Frontend"
    run_tests "Backend" "Backend"
    
    log_info "=== Compilation ==="
    echo "Compilation..."
    build_project "Frontend" "Frontend"
    build_project "Backend" "Backend"
    
    log_info "=== Déploiement ==="
    echo "Déploiement..."
    deploy
    
    log_success "=== Processus terminé avec succès ==="
    log_info "Log complet: $LOG_FILE"
    log_info "Dernier log: $LATEST_LOG"
    echo ""
    echo "✅ Mise à jour et déploiement terminés avec succès"
    echo "📄 Log: $LOG_FILE"
    echo "📄 Dernier log: $LATEST_LOG"
}

main "$@"
