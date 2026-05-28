# 🐳 Order Flow - Configuração com Docker

## 📋 Requisitos

- Docker (instalado e rodando)
- Docker Compose
- Pelo menos 2GB de RAM disponível

**Instalação:**
- Windows/Mac: [Docker Desktop](https://www.docker.com/products/docker-desktop)
- Linux: `sudo apt-get install docker.io docker-compose`

## 🚀 Começar em 3 passos

### 1. Clone/prepare o projeto
```bash
cd order-flow
```

### 2. Inicie os containers
```bash
# Windows
docker-manage.bat up

# Linux/Mac
./docker-manage.sh up
```

### 3. Acesse a aplicação
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Documentação API**: http://localhost:8000/docs

**Credenciais:**
- Username: `admin`
- Password: `admin123`

---

## 🛠️ Comandos úteis

### Iniciar containers
```bash
docker-compose up -d
```

### Parar containers
```bash
docker-compose down
```

### Ver logs em tempo real
```bash
docker-compose logs -f
```

### Logs específicos
```bash
docker-compose logs -f backend     # Backend
docker-compose logs -f frontend    # Frontend
docker-compose logs -f db          # Banco de dados
```

### Reiniciar um container
```bash
docker-compose restart backend
docker-compose restart frontend
docker-compose restart db
```

### Remover tudo (incluindo dados!)
```bash
docker-compose down -v
```

### Acessar shell do backend
```bash
docker-compose exec backend bash
```

### Acessar banco de dados
```bash
docker-compose exec db psql -U orderflow_user -d ordem_vendas
```

---

## 📊 Estrutura do Docker Compose

### Serviços
- **db** (PostgreSQL 16)
  - Host: `db:5432`
  - User: `orderflow_user`
  - Password: `orderflow_password`
  - Database: `ordem_vendas`

- **backend** (FastAPI)
  - Porta: `8000`
  - URL: `http://localhost:8000`
  - Swagger: `http://localhost:8000/docs`

- **frontend** (React + Vite)
  - Porta: `3000`
  - URL: `http://localhost:3000`

### Volumes
- `postgres_data` - Dados do banco de dados (persistente)

### Networks
- `orderflow-network` - Rede interna para comunicação entre containers

---

## 🔧 Variáveis de Ambiente

Criar arquivo `.env` na raiz do projeto:

```env
DATABASE_URL=postgresql://orderflow_user:orderflow_password@db:5432/ordem_vendas
JWT_SECRET_KEY=your-secret-key-change-in-production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

Ou copiar do template:
```bash
cp .env.example .env
```

---

## 🐛 Troubleshooting

### Container não inicia
```bash
docker-compose logs backend
docker-compose logs frontend
docker-compose logs db
```

### Porta já em uso
```bash
# Mudar portas no docker-compose.yml
# Exemplo: "3001:3000" em vez de "3000:3000"
```

### Banco de dados não conecta
```bash
# Reiniciar container de banco
docker-compose restart db
# Esperar 10 segundos e tentar novamente
```

### Limpar tudo e começar do zero
```bash
docker-compose down -v
docker-compose build
docker-compose up -d
```

---

## 📁 Arquivos de configuração

```
├── docker-compose.yml       # Orquestração dos containers
├── Dockerfile.frontend      # Build do frontend
├── backend/Dockerfile       # Build do backend
├── .dockerignore           # Arquivos ignorados no build
├── .env.example            # Template de variáveis
└── docker-manage.sh        # Script de gerenciamento (Linux/Mac)
└── docker-manage.bat       # Script de gerenciamento (Windows)
```

---

## 🌐 URLs importantes

| Serviço | URL | Descrição |
|---------|-----|-----------|
| Frontend | http://localhost:3000 | Aplicação OrderFlow |
| Backend | http://localhost:8000 | API REST |
| Swagger | http://localhost:8000/docs | Documentação interativa |
| ReDoc | http://localhost:8000/redoc | Documentação alternativa |
| Banco | localhost:5432 | PostgreSQL |

---

## 📝 Notas

- Os dados do banco são persistidos em `postgres_data`
- Logs são disponíveis via `docker-compose logs`
- Alterações em código requerem rebuild: `docker-compose build && docker-compose up -d`
- Para desenvolvimento, remova volume `volumes: - ./backend:/app` do backend

---

## ✅ Checklist de inicialização

- [ ] Docker e Docker Compose instalados
- [ ] `.env` criado (copiar de `.env.example`)
- [ ] `docker-compose up -d` executado
- [ ] Aguardar ~30 segundos para inicialização
- [ ] Acessar http://localhost:3000
- [ ] Fazer login com admin/admin123
- [ ] Verificar Swagger em http://localhost:8000/docs

---

## 🆘 Suporte

Se encontrar problemas:
1. Verifique os logs: `docker-compose logs -f`
2. Reinicie os containers: `docker-compose restart`
3. Limpe tudo: `docker-compose down -v && docker-compose up -d`
4. Verifique se portas 3000, 5432, 8000 estão livres

---

**Versão**: 1.0.0  
**Última atualização**: 2024
