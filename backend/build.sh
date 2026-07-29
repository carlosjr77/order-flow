#!/bin/bash
# Script de build para deploy em serviços de hospedagem (Render, Railway, etc.)
# Este script executa as migrations e o seed antes de iniciar a aplicação

set -e

echo "=========================================="
echo "   Order Flow Backend - Build/Deploy"
echo "=========================================="

# Instalar dependências (caso ainda não estejam instaladas)
echo "📦 Instalando dependências..."
pip install -r requirements.txt

# Executar setup do banco (migrations + seed de admin)
echo "🔄 Executando setup do banco de dados..."
python seed_db.py

echo "✅ Build/Deploy preparado!"
