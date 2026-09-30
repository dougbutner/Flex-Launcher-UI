# Namecheap API for api.flex.forex

This folder is the MySQL API. Cloudflare Pages serves the UI and calls `https://api.flex.forex`.

## cPanel (do not change nameservers)

Keep `flex.forex` on Cloudflare nameservers. Do **not** switch the domain to `dns1.namecheaphosting.com` / `dns2.namecheaphosting.com`. That error appears when cPanel **Addon Domains** checks WHOIS NS. Pages on `flex.forex` would go dark.

Use one of these instead:

1. **Subdomain, not addon.** In cPanel go to **Domains** (or **Subdomains**). Create host `api` on `flex.forex`. Do not type `api.flex.forex` as a new addon domain.
2. If `flex.forex` is not on this hosting account yet, add **`flex.forex`** (the apex), not `api.flex.forex`. The error page has a **validate** path: copy the **TXT** record, add it in Cloudflare DNS for `flex.forex` (grey cloud / DNS only), then click Begin validation. After that, create the `api` subdomain.
3. Then in Cloudflare DNS, add `api` as an **A** record to the cPanel shared IP (cPanel sidebar, Shared IP Address), proxy **DNS only**. cPanel Zone Editor is unused while Cloudflare is authoritative.

After cPanel says the `flex.forex` domain was created: ignore the nameserver warning and the apex SSL job. Public `https://flex.forex` stays on Cloudflare Pages. Do not upload the Vite app into `/home/.../flex.forex`. Create subdomain `api` and put this API folder in **that** document root (for example `/home/bambigth/flex.forex/api`).

## Upload

1. Document root for `api.flex.forex` should be this folder (the one that contains `index.php`), not a nested `api` directory.
2. Copy every file here into that document root via File Manager (include `lib/` and `sql/`).
3. Copy `config.example.php` to `config.php`. Fill MySQL for **localhost** (same cPanel account). Do not use a remote host.
4. In phpMyAdmin, import `sql/schema.sql`, then `sql/data.sql`.
5. PHP needs curl. cPanel: Select PHP Version, enable curl if it is off.
6. DNS: A or CNAME `api` to Namecheap hosting. Grey-cloud (DNS only) on Cloudflare is the simple choice for this origin. An orange-cloud `api` record that cannot TCP to cPanel shows as browser CORS plus Cloudflare **522**. PHP never runs, so no `Access-Control-Allow-Origin`. Fix the A record to the cPanel shared IP, grey cloud, then wait for DNS. After that, `https://api.flex.forex/api/site` should JSON, not `error code: 522`.

## config.php

- `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`: cPanel database. Host is localhost.
- `ALLOWED_ORIGINS`: keep `https://flex.forex` and `https://www.flex.forex`.
- `CACHE_REFRESH_URL` / `REFRESH_SECRET`: Pages `GET /api/refresh`. Same secret on Pages.
- `PINATA_JWT` / `GITHUB_TOKEN`: logo pin and listing PRs.

## Check

Open `https://api.flex.forex/api/site`. You want `{"live":false,"db":true,...}`.

From the Pages site, club chat, Manager, and Admin listing/pin should hit this host, not `/api` on Pages.
