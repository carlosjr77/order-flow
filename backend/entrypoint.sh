#!/bin/bash
# Entrypoint do backend: executa migrations/seed e inicia a aplicação

set -e

echo "=========================================="
echo "   Order Flow Backend - Entrypoint"
echo "=========================================="

# Aguardar o banco de dados ficar disponível
if [ -n "$DATABASE_URL" ]; then
    echo "⏳ Aguardando banco de dados ficar disponível..."
    until pg_isready -d "$DATABASE_URL" > /dev/null 2>&1; do
        echo "⏳ Aguardando banco de dados..."
        sleep 1
    done
    echo "✅ Banco de dados disponível!"
fi

# Executar criação de tabelas e seed de admin
echo "🔄 Executando setup do banco de dados..."
python seed_db.py

# Iniciar aplicação
echo "🚀 Iniciando aplicação..."
exec "$@"
