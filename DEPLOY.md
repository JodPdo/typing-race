# Deploy — Typing Race

Production: **https://race.aiklaotrip.com** on an existing Ubuntu VPS that already runs
nginx + PM2 (with other apps on ports **3000–3003** — do not touch those). This app uses
port **3004**. TLS for the domain is already handled by the box's certbot/nginx setup.

Pipeline overview: push to `main` → GitHub Actions runs CI (tests + typecheck + build) →
on success, copies `server/dist`, `server/package.json`, and `client/dist` to the VPS over
SSH and reloads PM2. nginx serves the static client and reverse-proxies WebSocket + API to
`127.0.0.1:3004`.

The steps below are the **one-time manual setup** a human runs on the box / in GitHub.

---

## 1. PostgreSQL database (on the VPS)

Persistence is optional, but to enable the leaderboard create a database and user:

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE typingrace;
CREATE USER typingrace WITH PASSWORD 'CHOOSE_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE typingrace TO typingrace;
SQL
```

Provide the connection string to the service via an **untracked** env file (never commit
it), e.g. `/var/www/typing-race/server/.env` or a systemd/pm2 env file:

```bash
# /var/www/typing-race/server/.env   (see server/.env.example)
DATABASE_URL=postgres://typingrace:CHOOSE_A_STRONG_PASSWORD@127.0.0.1:5432/typingrace
PORT=3004
```

The server creates its table + indexes automatically on boot (`initDb()`); with no
`DATABASE_URL` it simply runs without persistence.

## 2. GitHub repo secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Secret | Value |
|--------|-------|
| `VPS_HOST` | the server hostname or IP |
| `VPS_USER` | the SSH user used for deploys |
| `VPS_SSH_KEY` | the **private** SSH key (PEM) whose public key is in the user's `authorized_keys` |

The workflow references these only as `${{ secrets.* }}` — nothing is hardcoded.

## 3. nginx site

Copy the provided server block and enable it (target path
`/var/www/typing-race/client` must hold the deployed client build):

```bash
sudo mkdir -p /var/www/typing-race/server /var/www/typing-race/client
sudo cp deploy/nginx.race.conf /etc/nginx/sites-available/race.aiklaotrip.com
sudo ln -s /etc/nginx/sites-available/race.aiklaotrip.com /etc/nginx/sites-enabled/
sudo nginx -t            # MUST pass before reloading
sudo systemctl reload nginx
```

The `/socket.io/` location **must** keep the WebSocket upgrade headers
(`Upgrade`/`Connection "upgrade"`, `proxy_http_version 1.1`) — without them the realtime
connection fails in production. TLS (443) is added by the existing certbot setup; run
`sudo certbot --nginx -d race.aiklaotrip.com` only if this domain isn't covered yet.

## 4. First-time PM2 start

Put `ecosystem.config.js` on the box (e.g. clone the repo to `/var/www/typing-race` or copy
the file there), install prod deps once, then start:

```bash
cd /var/www/typing-race/server && npm ci --omit=dev
cd /var/www/typing-race && pm2 start ecosystem.config.js
pm2 save                 # persist across reboots
pm2 startup              # (once) enable the pm2 systemd service
```

After this, the CI/CD `deploy` job keeps it updated with `pm2 reload typing-race`.

## 5. Ship it

```bash
git push origin main
```

Watch the run under the repo's **Actions** tab. CI must go green before `deploy` starts.
When it finishes, verify:

- App loads: <https://race.aiklaotrip.com>
- Health: `curl https://race.aiklaotrip.com/api/leaderboard` → `{"leaderboard":[...]}`
- A solo race connects and the bot moves (confirms the WebSocket upgrade works through
  nginx).

---

### Rollback

PM2 keeps the previous process; if a deploy misbehaves, redeploy a known-good commit
(push a revert to `main`) or `pm2 reload typing-race` after restoring prior `dist`. Live
game state is in-memory and ephemeral, so a reload only drops in-progress races, not data.
