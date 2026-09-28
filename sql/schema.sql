-- Flex Launcher MySQL schema.
-- Import this file once on the Namecheap database (phpMyAdmin or the mysql CLI).
-- Then import sql/data.sql.
--
-- Cloudflare Pages env vars (server only, never VITE_):
--   MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
-- Optional: MYSQL_PORT (default 3306), MYSQL_SSL=1 if the host requires TLS.
--
-- Namecheap remote MySQL must allow the connecting host. Workers do not
-- share one static address, so the database user needs a remote host of %.
-- Snapshots in cache_entries are reused for 15 seconds. Rain bypasses that.

CREATE TABLE IF NOT EXISTS site_settings (
  id TINYINT UNSIGNED NOT NULL,
  live TINYINT(1) NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  updated_by VARCHAR(12) NOT NULL DEFAULT '',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS manager_tokens (
  contract VARCHAR(12) NOT NULL,
  symbol VARCHAR(7) NOT NULL,
  issuer VARCHAR(12) NOT NULL,
  body LONGTEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (contract, symbol),
  KEY idx_manager_issuer (issuer),
  KEY idx_manager_contract (contract)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract VARCHAR(12) NOT NULL,
  symbol VARCHAR(7) NOT NULL,
  author VARCHAR(12) NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  body VARCHAR(500) NOT NULL,
  created_at BIGINT NOT NULL,
  author_score INT NOT NULL DEFAULT 0,
  giphy_url VARCHAR(500) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_posts_room (contract, symbol, parent_id, created_at),
  KEY idx_posts_author_day (author, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tips (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NOT NULL,
  from_account VARCHAR(12) NOT NULL,
  amount VARCHAR(40) NOT NULL,
  memo VARCHAR(256) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_tips_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NOT NULL,
  from_account VARCHAR(12) NOT NULL,
  to_account VARCHAR(12) NOT NULL,
  amount_raw INT NOT NULL,
  quantity VARCHAR(40) NOT NULL,
  txid CHAR(64) NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ups_txid (txid),
  KEY idx_ups_post (post_id),
  KEY idx_ups_to_day (to_account, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS captcha (
  id CHAR(24) NOT NULL,
  answer VARCHAR(8) NOT NULL,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_captcha_exp (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cache_entries (
  cache_key VARCHAR(160) NOT NULL,
  payload LONGTEXT NOT NULL,
  refreshed_at BIGINT NOT NULL DEFAULT 0,
  refresh_lock BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (cache_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chain_txs (
  tx_id CHAR(64) NOT NULL,
  actor VARCHAR(12) NOT NULL,
  contract VARCHAR(12) NOT NULL DEFAULT '',
  action_name VARCHAR(13) NOT NULL DEFAULT '',
  symbol VARCHAR(7) NOT NULL DEFAULT '',
  actions_json LONGTEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (tx_id),
  KEY idx_txs_actor (actor, created_at),
  KEY idx_txs_pair (contract, symbol, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
