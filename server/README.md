# Contact form endpoint

The contact form on `index.html` POSTs JSON to `/api/contact`. Nginx proxies that
path to this small Node service, which forwards the message to Telegram and/or
email (Resend). The site itself stays static — nothing else changes.

The service holds the secrets, which is the whole point: a bot token or API key
in the page source would let anyone send on your behalf.

## Files

| File | Purpose |
| --- | --- |
| `contact-service.js` | The endpoint. No dependencies, Node 18+ (needs global `fetch`). |
| `novica-contact.service` | systemd unit, installed to `/etc/systemd/system/`. |
| `contact.env.example` | Template for `/etc/novica-contact.env` — the secrets live there, never in git. |

## One-time server setup

**Already applied on `novica.trif.rs`** (env file, unit, nginx proxy). Kept here
for reference and for rebuilding the box. The only step left is filling in the
secrets in `/etc/novica-contact.env`.

```bash
# 1. Secrets
cp /srv/sites/novica/my-landing-page/server/contact.env.example /etc/novica-contact.env
chmod 600 /etc/novica-contact.env
$EDITOR /etc/novica-contact.env          # fill in tokens, pick CHANNELS

# 2. Service
cp /srv/sites/novica/my-landing-page/server/novica-contact.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now novica-contact
systemctl status novica-contact

# 3. Check it came up with the channels you expect
curl -s localhost:8787/health        # {"ok":true,"channels":["telegram","email"]}
```

Then add the proxy to the site's nginx server block, **above** the static
`location /`:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

`X-Forwarded-For` matters — the rate limiter reads it. Without it every request
looks like it comes from `127.0.0.1` and one spammer would lock out everyone.

```bash
nginx -t && systemctl reload nginx
```

## Switching channels later

Edit `CHANNELS` in `/etc/novica-contact.env` and restart:

```bash
sed -i 's/^CHANNELS=.*/CHANNELS=telegram/' /etc/novica-contact.env
systemctl restart novica-contact
```

Valid values: `telegram`, `email`, or both comma-separated. Leave the line empty
and every channel with filled-in credentials is enabled automatically. A channel
listed without its credentials is skipped with a warning rather than crashing
the service.

## Getting the Telegram credentials

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token.
2. Send your new bot any message (a bot cannot start the conversation).
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and read
   `result[0].message.chat.id`.

## Deploys

`.github/workflows/deploy.yml` restarts the service after `git pull`, but only
if it is already installed — so the workflow keeps working until you complete
the setup above.

## Abuse handling

- **Honeypot** — a hidden `website` field. Filled in means bot; the request gets
  a normal-looking `200` and is dropped, so the bot learns nothing.
- **Rate limit** — 5 messages per IP per hour, in memory (`RATE_LIMIT_MAX`,
  `RATE_LIMIT_WINDOW_MS`). Resets on restart, which is fine at this scale.
- **Size caps** — 32 KB body, and per-field limits (message 5000 chars).

## Logs

```bash
journalctl -u novica-contact -f
```

Each delivered message logs the sender address, the IP, and which channels went
through. Failures log the upstream error. Message bodies are never logged.
