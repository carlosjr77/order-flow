#!/bin/bash
# Script para iniciar Order Flow (em um terminal único)

echo "=========================================="
echo "   Order Flow - Sistema de Gestão"
echo "=========================================="
echo ""

# Verificar se Python está instalado
if ! command -v python &> /dev/null; then
    echo "❌ Python não encontrado. Instale Python 3.10+"
    exit 1
fi

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale Node.js 18+"
    exit 1
fi

echo "✅ Python encontrado"
echo "✅ Node.js encontrado"
echo ""

# Iniciar Backend
echo "🚀 Iniciando Backend..."
cd backend

if [ ! -d "venv" ]; then
    echo "📦 Criando ambiente virtual..."
    python -m venv venv
fi

source venv/Scripts/activate  # Windows
# source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt -q

echo "🔄 Executando setup do banco de dados (migrations + seed)..."
python seed_db.py

echo "✅ Backend iniciando em http://localhost:8000"
python main.py &

sleep 2

# Iniciar Frontend
echo ""
echo "🚀 Iniciando Frontend..."
cd ..

npm install -q 2>/dev/null || npm install

echo "✅ Frontend iniciando em http://localhost:5173"
npm run dev

echo ""
echo "=========================================="
echo "🎉 Order Flow rodando!"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:8000"
echo "=========================================="
