# Bascule MongoDB → MariaDB + déménagement de cluster

Le backend ne lit plus que MariaDB. Ce document décrit l'ordre des opérations le
jour de la bascule ; il n'a plus d'utilité ensuite.

Deux changements arrivent en même temps :

- **base** : MongoDB → MariaDB, cluster Galera joint par le service interne
  `galera-lb.database.svc.cluster.local`
- **hébergement** : ancien K3s → nouveau cluster Proxmox

## Ce qui change dans le code

| Avant | Après |
| --- | --- |
| `MONGODB_URI`, `MONGODB_USER`, `MONGODB_PASSWORD`, `MONGODB_DB`, `MONGODB_HOST` | `MARIADB_HOST`, `MARIADB_PORT`, `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_DATABASE` |
| 16 collections | 18 tables (`src/config/schema.sql`) |
| `_id` ObjectId | `id VARCHAR(36)` — **les ObjectId sont repris tels quels** |

Le contrat de l'API est inchangé : aucune modification côté frontend.

Les identifiants étant conservés, les sessions ouvertes (cookie `authToken`
portant l'`_id` Mongo) restent valides, et les liens déjà partagés vers une
commande continuent de fonctionner.

## ⚠️ Les SealedSecrets ne survivent pas au changement de cluster

Un SealedSecret est chiffré avec la clé privée **du cluster qui l'a scellé**. Le
nouveau cluster a une autre clé : les blocs `encryptedData` déjà présents dans le
repo lui sont **illisibles**, y compris ceux qui n'ont rien à voir avec la base.

Il faut donc, sur le nouveau cluster :

1. installer le controller Sealed Secrets ;
2. récupérer son certificat (`pub-cert.pem` à la racine est celui de l'ancien
   cluster, il est périmé) ;
3. resceller **l'intégralité** de `secrets/clos-secrets.yaml`, pour la prod et
   pour le dev.

Sinon les pods restent en `CreateContainerConfigError`.

## Prérequis sur le nouveau cluster

- controller Sealed Secrets installé
- secret de pull GHCR nommé `ghcr-secret` dans les namespaces
  `clos-de-la-reine` et `clos-de-la-reine-dev` (cf. `imagePullSecrets` des values)
- Traefik + le CRD `IngressRoute` (cf. `templates/ingress-route.yaml`)
- DNS de `leclosdelareine.com` à repointer vers le nouveau cluster **en dernier**

Sur un nœud Galera (data1 par exemple) :

```sql
CREATE DATABASE clos_de_la_reine CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'clos_admin'@'%' IDENTIFIED BY '<mot de passe>';
GRANT ALL PRIVILEGES ON clos_de_la_reine.* TO 'clos_admin'@'%';
FLUSH PRIVILEGES;
```

`galera-lb.database.svc.cluster.local` n'est résolvable que **depuis l'intérieur
du cluster** : le chargement du dump se fait donc sur un nœud Galera, pas depuis
un poste extérieur.

Puis renseigner `mariadb-password` dans
`charts/clos-de-la-reine/secrets/clos-secrets.yaml` et resceller (cf. plus haut).

## Reprise des données

L'ancien Mongo et le nouveau MariaDB ne sont pas sur le même réseau : on passe
par un fichier `.sql` intermédiaire.

### 1. Extraire Mongo vers un fichier SQL

À jouer là où l'**ancien** Mongo est joignable. En mode `--sql-out` le script
n'ouvre aucune connexion MariaDB et ne charge pas le driver : deux fichiers et
le paquet `mongodb` suffisent, rien d'autre à installer sur le serveur.

```bash
mkdir -p ~/clos-export && cd ~/clos-export
# copier depuis le repo : scripts/migrate-mongo-to-mariadb.js et src/config/schema.sql
npm install mongodb
MONGODB_URI='mongodb://clos_admin:<mdp>@192.168.1.32:27017/clos_de_la_reine_db?authSource=clos_de_la_reine_db&replicaSet=rs0&directConnection=true' \
MONGODB_DB=clos_de_la_reine_db \
  node migrate-mongo-to-mariadb.js --sql-out clos-$(date +%F).sql
```

Le script trouve `schema.sql` soit dans l'arborescence du repo, soit posé à côté
de lui. Le fichier produit contient le schéma puis les données en `REPLACE INTO`,
une instruction par ligne (les images sont des LONGTEXT base64 de plusieurs Mo).
`--dry-run` à la place de `--sql-out` compte les lignes sans rien écrire.

### 2. Charger sur un nœud Galera

Copier le `.sql` sur data1, puis :

```bash
mariadb --max-allowed-packet=256M -u clos_admin -p clos_de_la_reine < clos-AAAA-MM-JJ.sql
```

`--max-allowed-packet` n'est pas optionnel : une ligne `products` portant
plusieurs images base64 dépasse la valeur par défaut.

Le dump est **idempotent** : le rejouer écrase les lignes au lieu d'échouer.
D'où la manière de faire recommandée — une passe à froid pour vérifier, puis une
passe finale après l'arrêt de l'ancien backend.

### 3. Vérifier

```bash
mariadb -u clos_admin -p clos_de_la_reine -e "
SELECT 'users' t, COUNT(*) n FROM users UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'orders', COUNT(*) FROM orders UNION ALL SELECT 'order_items', COUNT(*) FROM order_items;"
```

À comparer au résumé affiché par le script à l'étape 1.

## Déroulé de la bascule

1. **Répétition à froid** — étapes 1 à 3 avec l'ancien site toujours en ligne.
2. **Fenêtre de bascule** — figer les écritures sur l'ancien cluster :
   ```bash
   kubectl -n clos-de-la-reine scale deploy/clos-de-la-reine-back --replicas=0
   ```
3. **Passe finale** — rejouer les étapes 1 et 2 pour rattraper les commandes
   passées entre-temps.
4. **Sceller et pousser** — récupérer `pub-cert.pem` du nouveau cluster, puis
   sceller hors ligne pour les deux namespaces (le scope doit être
   `namespace-wide`, pour concorder avec l'annotation des templates) :

   ```bash
   kubeseal --format yaml --cert pub-cert.pem --scope namespace-wide \
     --namespace clos-de-la-reine < charts/clos-de-la-reine/secrets/clos-secrets.yaml
   ```

   Le bloc `encryptedData` va dans `templates/sealed-secret.yaml` pour la prod,
   et dans `sealedSecretDev.encryptedData` de `values-dev.yaml` pour le dev
   (scellé avec `--namespace clos-de-la-reine-dev`). Committer, pousser : la CI
   construit l'image, ArgoCD synchronise.
5. **Créer les Applications ArgoCD** :
   ```bash
   kubectl apply -f argocd/clos-de-la-reine.yaml -n argocd
   kubectl apply -f argocd/clos-de-la-reine-dev.yaml -n argocd
   ```
6. **Vérifier avant de basculer le DNS** :
   ```bash
   kubectl -n clos-de-la-reine logs deploy/clos-de-la-reine-back | grep MariaDB
   kubectl -n clos-de-la-reine port-forward deploy/clos-de-la-reine-back 8080:3000
   curl localhost:8080/api/health   # {"status":"ok","db":"connected"}
   ```
   Puis, dans le navigateur : boutique (filtres couleur et collection), FAQ,
   galerie, connexion d'un compte existant, panier, historique de commandes,
   panel admin et statistiques.
7. **Repointer le DNS**, puis surveiller les logs.
8. **Retour arrière** — tant que l'ancien cluster et Mongo sont debout, il suffit
   de remettre le DNS et de remonter l'ancien déploiement. Garder Mongo en
   lecture seule quelques jours avant de la supprimer.

## Ce que la migration ne reprend pas

`admin_login_attempts` et `ip_bans` : données de sécurité éphémères (TTL 24 h /
durée du bannissement), sans valeur après la bascule.

## Développement local

```bash
cd Backend && docker compose -f docker-compose.dev.yml up
```

MariaDB sur le port 3307, backend sur le 3000, schéma créé au démarrage.
