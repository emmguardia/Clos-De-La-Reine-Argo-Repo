-- ---------------------------------------------------------------------------
-- Clos de la Reine — schéma MariaDB
--
-- Idempotent : rejoué à chaque démarrage du backend (cf. ensureSchema()).
-- Équivalent des createIndex() qui tournaient au connect côté MongoDB.
--
-- Les identifiants exposés au frontend sont en VARCHAR(36) : ils accueillent
-- aussi bien les ObjectId Mongo repris tels quels par la migration (24 hex)
-- que les UUID v4 générés pour les nouvelles lignes (36 car.). Aucune session
-- ni aucun lien existant n'est cassé par la bascule.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(36)  NOT NULL,
  email       VARCHAR(255) NOT NULL,
  password    VARCHAR(255) NOT NULL,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  last_login  DATETIME(3)  NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT NOW(3),
  updated_at  DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- id = identifiant métier incrémental (déjà présent en base Mongo), celui que
-- le frontend manipule dans les URLs /boutique et le panier.
CREATE TABLE IF NOT EXISTS products (
  id                   INT UNSIGNED  NOT NULL,
  name                 VARCHAR(255)  NOT NULL,
  price                DECIMAL(10,2) NOT NULL,
  image                LONGTEXT      NOT NULL,
  second_image         LONGTEXT      NULL,
  additional_images    LONGTEXT      NOT NULL DEFAULT '[]',
  category             VARCHAR(50)   NOT NULL,
  `collection`         VARCHAR(100)  NOT NULL,
  color                LONGTEXT      NOT NULL DEFAULT '[]',
  sizes                LONGTEXT      NOT NULL DEFAULT '[]',
  surcharge_1m20       DECIMAL(10,2) NULL,
  surcharge_sur_mesure DECIMAL(10,2) NULL,
  is_new               TINYINT(1)    NOT NULL DEFAULT 0,
  disponible           TINYINT(1)    NOT NULL DEFAULT 1,
  brief_description    VARCHAR(500)  NOT NULL DEFAULT '',
  created_at           DATETIME(3)   NOT NULL DEFAULT NOW(3),
  updated_at           DATETIME(3)   NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id),
  KEY idx_products_category (category),
  KEY idx_products_collection (`collection`),
  KEY idx_products_is_new (is_new)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Collation utf8mb4_unicode_ci : l'unicité du nom est insensible à la casse,
-- ce que faisait le $regex ^nom$ /i côté Mongo.
CREATE TABLE IF NOT EXISTS collections (
  id         VARCHAR(36)  NOT NULL,
  name       VARCHAR(100) NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3)  NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_collections_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gallery (
  id          VARCHAR(36)  NOT NULL,
  name        VARCHAR(200) NOT NULL,
  data        LONGTEXT     NOT NULL,
  type        VARCHAR(20)  NOT NULL DEFAULT 'professional',
  uploaded_by VARCHAR(50)  NOT NULL DEFAULT 'admin',
  created_at  DATETIME(3)  NOT NULL DEFAULT NOW(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id),
  KEY idx_gallery_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS images (
  id          VARCHAR(36)  NOT NULL,
  name        VARCHAR(255) NOT NULL,
  data        LONGTEXT     NOT NULL,
  uploaded_by VARCHAR(50)  NOT NULL DEFAULT 'admin',
  type        VARCHAR(50)  NOT NULL DEFAULT 'product',
  uploaded_at DATETIME(3)  NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- display_order / category_order : `order` est un mot réservé SQL.
CREATE TABLE IF NOT EXISTS faq (
  id             VARCHAR(36)  NOT NULL,
  category       VARCHAR(100) NOT NULL,
  question       VARCHAR(500) NOT NULL,
  answer         TEXT         NOT NULL,
  display_order  INT          NOT NULL DEFAULT 0,
  category_order INT          NOT NULL DEFAULT 0,
  sort_order     INT          NOT NULL DEFAULT 0,
  created_at     DATETIME(3)  NOT NULL DEFAULT NOW(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id),
  KEY idx_faq_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ligne unique id='pricing' (remplace le document { _id: 'pricing' }).
CREATE TABLE IF NOT EXISTS settings (
  id               VARCHAR(50)   NOT NULL,
  surmesurecollier DECIMAL(10,2) NULL,
  surmesureharnais DECIMAL(10,2) NULL,
  laisse_1m20      DECIMAL(10,2) NULL,
  updated_at       DATETIME(3)   NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- size NOT NULL DEFAULT '' : une clé primaire ne peut pas dédupliquer des NULL,
-- la taille absente est donc stockée en chaîne vide (et omise dans le JSON).
CREATE TABLE IF NOT EXISTS cart_items (
  user_id    VARCHAR(36)  NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  size       VARCHAR(20)  NOT NULL DEFAULT '',
  quantity   INT          NOT NULL,
  added_at   DATETIME(3)  NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3)  NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (user_id, product_id, size),
  KEY idx_cart_user_added (user_id, added_at),
  CONSTRAINT fk_cart_items_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS favorites (
  user_id    VARCHAR(36)  NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (user_id, product_id),
  KEY idx_favorites_user_created (user_id, created_at),
  CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pas de clé étrangère sur user_id : la suppression de compte (RGPD) ne doit
-- pas effacer les commandes, conservées 10 ans (art. L123-22 code de commerce).
-- UNIQUE sur order_number tolère plusieurs NULL en MariaDB : équivalent exact
-- du partial index unique Mongo sur les commandes antérieures à la numérotation.
CREATE TABLE IF NOT EXISTS orders (
  id                     VARCHAR(36)   NOT NULL,
  order_number           VARCHAR(20)   NULL,
  user_id                VARCHAR(36)   NOT NULL,
  ship_first_name        VARCHAR(100)  NULL,
  ship_last_name         VARCHAR(100)  NULL,
  ship_email             VARCHAR(255)  NULL,
  ship_phone             VARCHAR(50)   NULL,
  ship_address           VARCHAR(255)  NULL,
  ship_city              VARCHAR(100)  NULL,
  ship_postal_code       VARCHAR(20)   NULL,
  ship_country           VARCHAR(100)  NULL,
  dog_breed              VARCHAR(100)  NULL,
  dog_age                VARCHAR(50)   NULL,
  dog_tour_de_cou        VARCHAR(50)   NULL,
  dog_tour_de_taille     VARCHAR(50)   NULL,
  dog_sur_mesure_collier TINYINT(1)    NOT NULL DEFAULT 0,
  dog_sur_mesure_harnais TINYINT(1)    NOT NULL DEFAULT 0,
  notes                  TEXT          NULL,
  total                  DECIMAL(10,2) NOT NULL,
  original_total         DECIMAL(10,2) NULL,
  shipping_amount        DECIMAL(10,2) NULL,
  fees_amount            DECIMAL(10,2) NULL,
  promo_code             LONGTEXT      NULL,
  status                 VARCHAR(40)   NOT NULL DEFAULT 'pending_validation',
  counter_proposal       LONGTEXT      NULL,
  payment_info           LONGTEXT      NULL,
  rejection_reason       TEXT          NULL,
  created_at             DATETIME(3)   NOT NULL DEFAULT NOW(3),
  updated_at             DATETIME(3)   NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_number (order_number),
  KEY idx_orders_user (user_id, created_at),
  KEY idx_orders_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   VARCHAR(36)     NOT NULL,
  product_id INT UNSIGNED    NOT NULL,
  quantity   INT             NOT NULL,
  price      DECIMAL(10,2)   NOT NULL,
  size       VARCHAR(20)     NULL,
  position   INT             NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id, position),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Numérotation des commandes, une ligne par jour (art. 242 nonies A CGI :
-- séquence chronologique sans rupture). Incrément atomique via
-- INSERT ... ON DUPLICATE KEY UPDATE seq = LAST_INSERT_ID(seq + 1).
CREATE TABLE IF NOT EXISTS counters (
  name       VARCHAR(64)  NOT NULL,
  seq        INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3)  NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promo_codes (
  id             VARCHAR(36)   NOT NULL,
  name           VARCHAR(100)  NULL,
  code           VARCHAR(50)   NOT NULL,
  discount_type  VARCHAR(20)   NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  max_uses       INT UNSIGNED  NOT NULL,
  current_uses   INT UNSIGNED  NOT NULL DEFAULT 0,
  is_active      TINYINT(1)    NOT NULL DEFAULT 1,
  start_date     DATETIME(3)   NULL,
  end_date       DATETIME(3)   NULL,
  created_at     DATETIME(3)   NOT NULL DEFAULT NOW(3),
  updated_at     DATETIME(3)   NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_promo_codes_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- UNIQUE sur order_id : idempotence de l'enregistrement d'un paiement, que le
-- findOne({ orderId }) assurait côté Mongo.
CREATE TABLE IF NOT EXISTS payment_stats (
  id           VARCHAR(36)   NOT NULL,
  order_id     VARCHAR(36)   NOT NULL,
  date         DATETIME(3)   NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  created_at   DATETIME(3)   NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_stats_order (order_id),
  KEY idx_payment_stats_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_stat_items (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_stat_id VARCHAR(36)     NOT NULL,
  product_id      INT UNSIGNED    NULL,
  `collection`    VARCHAR(100)    NOT NULL DEFAULT 'Autre',
  category        VARCHAR(50)     NOT NULL DEFAULT 'Autre',
  quantity        INT             NOT NULL,
  price           DECIMAL(10,2)   NOT NULL,
  item_total      DECIMAL(10,2)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_payment_stat_items_stat (payment_stat_id),
  CONSTRAINT fk_payment_stat_items FOREIGN KEY (payment_stat_id) REFERENCES payment_stats (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_auth (
  id            INT          NOT NULL DEFAULT 1,
  password_hash VARCHAR(255) NOT NULL,
  last_login    DATETIME(3)  NULL,
  last_login_ip VARCHAR(45)  NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Purge des lignes > 24 h faite par l'application (purgeExpiredSecurityRows),
-- l'event scheduler MariaDB n'étant pas garanti actif sur le serveur partagé.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip         VARCHAR(45)     NOT NULL,
  success    TINYINT(1)      NOT NULL,
  reason     VARCHAR(255)    NOT NULL DEFAULT '',
  user_agent VARCHAR(512)    NOT NULL DEFAULT 'unknown',
  timestamp  DATETIME(3)     NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id),
  KEY idx_admin_attempts_ip_ts (ip, timestamp),
  KEY idx_admin_attempts_ts (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ip_bans (
  ip         VARCHAR(45)  NOT NULL,
  banned_at  DATETIME(3)  NOT NULL DEFAULT NOW(3),
  expires_at DATETIME(3)  NOT NULL,
  reason     VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (ip),
  KEY idx_ip_bans_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
