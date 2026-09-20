# Tiny HTTPS reverse proxy for Render's free tier.
# Render gives this service a free https://<name>.onrender.com URL, terminates
# TLS at its edge, and forwards HTTP to Caddy on $PORT. Caddy forwards to the
# EC2 that runs the full SiteLens app (frontend + API), which talks to RDS.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
# The caddy base image auto-runs: caddy run --config /etc/caddy/Caddyfile
