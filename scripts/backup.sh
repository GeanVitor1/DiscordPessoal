#!/bin/sh
set -e

# ==============================================================================
# Script de Backup Automatizado do PostgreSQL (MeuApp)
# ==============================================================================

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/meuapp_db_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[Backup] Iniciando dump do banco PostgreSQL em ${FILENAME}..."

docker exec meuapp_postgres pg_dump -U "${POSTGRES_USER:-meuapp_user}" "${POSTGRES_DB:-meuapp_db}" | gzip > "$FILENAME"

echo "[Backup] Concluído com sucesso! Tamanho: $(du -h "$FILENAME" | cut -f1)"

# Retenção: remove backups com mais de 7 dias para não encher o disco
find "$BACKUP_DIR" -type f -name "meuapp_db_*.sql.gz" -mtime +7 -delete

echo "[Backup] Limpeza de arquivos antigos (> 7 dias) concluída."
