#!/bin/sh
set -e

# ==============================================================================
# Script de Restauração de Backup do PostgreSQL (MeuApp)
# Uso: ./scripts/restore.sh /caminho/para/meuapp_db_YYYYMMDD_HHMMSS.sql.gz
# ==============================================================================

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
  echo "Erro: Informe o arquivo de backup a ser restaurado."
  echo "Exemplo: $0 /backups/meuapp_db_20261001_120000.sql.gz"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Erro: Arquivo não encontrado: $BACKUP_FILE"
  exit 1
fi

echo "ATENÇÃO: A restauração sobrescreverá os dados existentes no banco!"
echo "Restaurando a partir de: $BACKUP_FILE"

gunzip -c "$BACKUP_FILE" | docker exec -i meuapp_postgres psql -U "${POSTGRES_USER:-meuapp_user}" -d "${POSTGRES_DB:-meuapp_db}"

echo "[Restore] Restauração concluída com sucesso no PostgreSQL!"
