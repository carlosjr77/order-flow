#!/bin/bash

# Script para gerenciar containers Docker

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funções
show_usage() {
  echo "Uso: ./docker-manage.sh [comando]"
  echo ""
  echo "Comandos:"
  echo "  up        - Inicia todos os containers"
  echo "  down      - Para todos os containers"
  echo "  restart   - Reinicia todos os containers"
  echo "  logs      - Mostra logs de todos os containers"
  echo "  logs-back - Mostra logs apenas do backend"
  echo "  logs-db   - Mostra logs apenas do banco"
  echo "  clean     - Remove containers e volumes (CUIDADO!)"
  echo "  build     - Faz rebuild dos images"
  echo "  status    - Mostra status dos containers"
}

case "$1" in
  up)
    echo -e "${YELLOW}Iniciando containers...${NC}"
    docker-compose up -d
    echo -e "${GREEN}Containers iniciados!${NC}"
    echo ""
    echo "URLs para acessar:"
    echo "  - Frontend: http://localhost:3000"
    echo "  - Backend: http://localhost:8000"
    echo "  - Swagger: http://localhost:8000/docs"
    echo ""
    echo "Credenciais:"
    echo "  - Username: admin"
    echo "  - Password: admin123"
    ;;
  down)
    echo -e "${YELLOW}Parando containers...${NC}"
    docker-compose down
    echo -e "${GREEN}Containers parados!${NC}"
    ;;
  restart)
    echo -e "${YELLOW}Reiniciando containers...${NC}"
    docker-compose restart
    echo -e "${GREEN}Containers reiniciados!${NC}"
    ;;
  logs)
    echo -e "${YELLOW}Mostrando logs (Ctrl+C para sair)...${NC}"
    docker-compose logs -f
    ;;
  logs-back)
    echo -e "${YELLOW}Mostrando logs do backend (Ctrl+C para sair)...${NC}"
    docker-compose logs -f backend
    ;;
  logs-db)
    echo -e "${YELLOW}Mostrando logs do banco (Ctrl+C para sair)...${NC}"
    docker-compose logs -f db
    ;;
  clean)
    echo -e "${RED}AVISO: Isto vai remover containers e volumes!${NC}"
    read -p "Tem certeza? (s/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
      docker-compose down -v
      echo -e "${GREEN}Limpeza concluída!${NC}"
    fi
    ;;
  build)
    echo -e "${YELLOW}Fazendo rebuild dos images...${NC}"
    docker-compose build
    echo -e "${GREEN}Build concluído!${NC}"
    ;;
  status)
    echo -e "${YELLOW}Status dos containers:${NC}"
    docker-compose ps
    ;;
  *)
    show_usage
    exit 1
    ;;
esac
