#!/usr/bin/env bash
# setup-vps.sh — Bootstrap multi-tenant en el VPS.
#
# Genera los 3 .env.{tenant} reusando los secretos del .env.local
# existente (OpenAI + Supabase), buildea Next y reinicia PM2 con
# delete + start (no restart) para que los workers tomen la env nueva.
#
# Pre-requisito: tiene que haber un .env.local en la raiz del proyecto
# con OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.
#
# Uso (desde el VPS, dentro de ~/MegaBot/agente-delivery):
#   bash scripts/setup-vps.sh

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local no existe en $(pwd). Crealo con OPENAI_API_KEY y NEXT_PUBLIC_SUPABASE_*." >&2
  exit 1
fi

extract_var() {
  local key=$1
  local value
  value=$(grep -E "^${key}=" .env.local | head -n1 | cut -d'=' -f2- || true)
  if [ -z "$value" ]; then
    echo "ERROR: $key no encontrado en .env.local" >&2
    exit 1
  fi
  printf '%s' "$value"
}

OPENAI_API_KEY=$(extract_var OPENAI_API_KEY)
OPENAI_MODEL=$(grep -E "^OPENAI_MODEL=" .env.local | head -n1 | cut -d'=' -f2- || echo "gpt-4o-mini")
SUPABASE_URL=$(extract_var NEXT_PUBLIC_SUPABASE_URL)
SUPABASE_ANON_KEY=$(extract_var NEXT_PUBLIC_SUPABASE_ANON_KEY)

echo "==> Secretos extraidos de .env.local OK."

write_env_file() {
  local file=$1
  local tenant_id=$2
  local worker_port=$3
  local data_dir=$4
  local products_table=$5
  local company_info_table=$6

  cat > "$file" <<EOF
TENANT_ID=$tenant_id
WORKER_PORT=$worker_port
DATA_DIR=$data_dir
SUPABASE_PRODUCTS_TABLE=$products_table
SUPABASE_COMPANY_INFO_TABLE=$company_info_table

WHATSAPP_PROVIDER=baileys
AI_REPLY_DELAY=false

OPENAI_API_KEY=$OPENAI_API_KEY
OPENAI_MODEL=$OPENAI_MODEL

NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

SUPABASE_PRODUCT_ID_COLUMN=id
SUPABASE_PRODUCT_NAME_COLUMN=name
SUPABASE_PRODUCT_DESCRIPTION_COLUMN=description
SUPABASE_PRODUCT_CATEGORY_COLUMN=category_id
SUPABASE_PRODUCT_PRICE_COLUMN=price
SUPABASE_PRODUCT_STOCK_COLUMN=stock

YCLOUD_API_KEY=
YCLOUD_PHONE_NUMBER_ID=
YCLOUD_WEBHOOK_SECRET=
EOF
  chmod 600 "$file"
  echo "  → $file (chmod 600)"
}

echo
echo "==> Generando .env.{tenant}..."
write_env_file .env.megamuebles  megamuebles  3001 ./data/megamuebles  products              info_empresa
write_env_file .env.iguazufalls  iguazufalls  3002 ./data/iguazufalls  products_iguazufalls  info_empresa_iguazufalls
write_env_file .env.impasto      impasto      3003 ./data/impasto      products_impasto      info_empresa_impasto

echo
echo "==> npm install..."
npm install

echo
echo "==> npm run build..."
npm run build

echo
echo "==> PM2 delete + start (delete: PM2 cachea env del primer spawn)..."
pm2 delete all || true
pm2 start ecosystem.config.js
pm2 save

echo
echo "==> Esperando 4s y leyendo logs de boot..."
sleep 4
echo "----------------------------------------"
pm2 logs --lines 40 --nostream | grep -E "boot|FATAL|tenant=" || true
echo "----------------------------------------"

echo
echo "==> pm2 status:"
pm2 status

echo
echo "✓ Listo. Cada worker debe haber impreso:"
echo "  [worker] boot | tenant=<su-id> | port=<su-port> | dataDir=..."
echo
echo "Ahora abri cada dashboard y escaneá el QR con la SIM correcta."
