# Tiny HTTPS reverse proxy for Render's free tier.
# Render gives this service a free https://<name>.onrender.com URL, terminates
# TLS at its edge, and forwards HTTP to nginx on $PORT. nginx forwards to the
# EC2 that runs the full SiteLens app (frontend + API), which talks to RDS.
#
# nginx (not Caddy) because Render's runtime rejects the Caddy binary's
# file-capabilities ("exec: operation not permitted").
FROM nginx:alpine

# The nginx image runs envsubst on *.template at startup, so ${PORT} (set by
# Render) is substituted into the real config before nginx starts.
COPY default.conf.template /etc/nginx/templates/default.conf.template
