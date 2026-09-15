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

## Clés attendues

Le deployment backend lit ces clés dans le secret `clos-secrets` :

| Clé | Contenu |
| --- | --- |
| `mariadb-host` | Hôte du serveur MariaDB |
| `mariadb-user` | Utilisateur MariaDB |
| `mariadb-password` | Mot de passe MariaDB |
| `mariadb-database` | Nom de la base |
| `jwt-secret` | Secret de signature des JWT de session |
| `jwt-private-key` / `jwt-public-key` | Paire RSA (Email-Service) |
| `jwt-invoice-private-key` | Clé RSA (Invoice-Service) |
| `admin-email` | Destinataire des notifications |
| `stripe-secret-key` / `stripe-publishable-key` | Stripe (optionnelles) |

Le port est passé en clair par `backend.env.MARIADB_PORT` (values.yaml), ce n'est
pas un secret.

⚠️ Les clés `mongodb-*` des anciennes versions ne sont plus lues : après le
passage à MariaDB, il faut **rejouer le scellement** (prod et dev) pour que
`mariadb-*` existe, sinon les pods restent en `CreateContainerConfigError`.
