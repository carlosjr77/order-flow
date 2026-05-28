@echo off
REM Script para gerenciar containers Docker (Windows)

if "%1"=="" (
  echo Uso: docker-manage.bat [comando]
  echo.
  echo Comandos:
  echo   up        - Inicia todos os containers
  echo   down      - Para todos os containers
  echo   restart   - Reinicia todos os containers
  echo   logs      - Mostra logs de todos os containers
  echo   logs-back - Mostra logs apenas do backend
  echo   logs-db   - Mostra logs apenas do banco
  echo   clean     - Remove containers e volumes (CUIDADO^!^)
  echo   build     - Faz rebuild dos images
  echo   status    - Mostra status dos containers
  exit /b 1
)

if "%1"=="up" (
  echo Iniciando containers...
  docker-compose up -d
  echo.
  echo Containers iniciados!
  echo.
  echo URLs para acessar:
  echo   - Frontend: http://localhost:3000
  echo   - Backend: http://localhost:8000
  echo   - Swagger: http://localhost:8000/docs
  echo.
  echo Credenciais:
  echo   - Username: admin
  echo   - Password: admin123
) else if "%1"=="down" (
  echo Parando containers...
  docker-compose down
  echo Containers parados!
) else if "%1"=="restart" (
  echo Reiniciando containers...
  docker-compose restart
  echo Containers reiniciados!
) else if "%1"=="logs" (
  echo Mostrando logs (Ctrl+C para sair)...
  docker-compose logs -f
) else if "%1"=="logs-back" (
  echo Mostrando logs do backend (Ctrl+C para sair)...
  docker-compose logs -f backend
) else if "%1"=="logs-db" (
  echo Mostrando logs do banco (Ctrl+C para sair)...
  docker-compose logs -f db
) else if "%1"=="clean" (
  echo AVISO: Isto vai remover containers e volumes!
  set /p response=Tem certeza? (s/n) 
  if /i "%response%"=="s" (
    docker-compose down -v
    echo Limpeza concluida!
  )
) else if "%1"=="build" (
  echo Fazendo rebuild dos images...
  docker-compose build
  echo Build concluido!
) else if "%1"=="status" (
  echo Status dos containers:
  docker-compose ps
) else (
  echo Comando desconhecido: %1
  exit /b 1
)
