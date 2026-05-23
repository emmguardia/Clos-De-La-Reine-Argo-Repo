# SealedSecret pour l'environnement Dev

Pour déployer automatiquement le secret en dev (plus de création manuelle, plus de fallback JWT) :

## Méthode automatique (recommandée)

Depuis ton PC (avec accès au repo et au cluster K3s) :
```powershell
cd charts/clos-de-la-reine
.\scripts\seal-and-update.ps1
```
Le script fait tout : copie, chiffre, met à jour values-dev.yaml, supprime le temporaire.

## Méthode manuelle

1. **Depuis `charts/clos-de-la-reine`** :
   ```powershell
   kubeseal --format yaml --namespace clos-de-la-reine-dev < secrets/clos-secrets.yaml
   ```

2. **Copie le bloc `spec.encryptedData`** de la sortie.

3. **Colle dans `values-dev.yaml`** à la place de `encryptedData: {}` :
   ```yaml
   sealedSecretDev:
     encryptedData:
       admin-email: "AgC5CKL..."
       jwt-secret: "AgC8Q/Gk..."
       jwt-private-key: "AgB5B..."
       # ... (toutes les clés)
   ```

4. **Commit** : les données chiffrées peuvent être commitées (seul le cluster peut déchiffrer).

**Rappel** : `secrets/clos-secrets.yaml` ne doit jamais être commité (.gitignore).
