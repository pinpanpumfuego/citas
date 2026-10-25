#!/usr/bin/env bash
set -euo pipefail
cd /opt/citas
read -r -s -p 'Contraseña fija de mantenimiento: ' maintenance_password
printf '\n'
read -r -s -p 'Repite la contraseña: ' maintenance_confirmation
printf '\n'
if [[ "$maintenance_password" != "$maintenance_confirmation" || ! "$maintenance_password" =~ ^[a-zA-Z0-9_-]{8,128}$ ]]; then
  printf 'No coinciden o el formato no es válido (8–128 letras, números, guiones).\n'
  exit 1
fi
umask 077
temporary_env=$(mktemp /opt/citas/.env.maintenance.XXXXXX)
trap 'rm -f -- "$temporary_env"' EXIT
awk '!/^MAINTENANCE_PASSWORD=/' .env > "$temporary_env"
printf '\nMAINTENANCE_PASSWORD=%s\n' "$maintenance_password" >> "$temporary_env"
mv -- "$temporary_env" .env
unset maintenance_password maintenance_confirmation
docker compose up -d app
printf 'Acceso de mantenimiento configurado. La contraseña principal sigue funcionando.\n'
