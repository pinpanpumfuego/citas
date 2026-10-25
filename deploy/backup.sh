#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/citas
mkdir -p /var/backups/citas
file="/var/backups/citas/citas-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose exec -T db pg_dump -U citas citas | gzip > "$file"
test -s "$file"
# Keep thirty days of local backups; off-server backups must be configured separately.
find /var/backups/citas -maxdepth 1 -type f -name 'citas-*.sql.gz' -mtime +30 -delete
