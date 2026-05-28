# Order Flow - Configuração Docker

## 🐳 Variáveis de Ambiente

### Backend (.env na raiz do projeto)
```
DATABASE_URL=postgresql://orderflow_user:orderflow_password@db:5432/ordem_vendas
SQLALCHEMY_DATABASE_URL=postgresql://orderflow_user:orderflow_password@db:5432/ordem_vendas
JWT_SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

### Frontend
As variáveis são passadas automaticamente via docker-compose.yml

## 🚀 Como usar

### Iniciar tudo com Docker Compose:
```bash
docker-compose up -d
```

### Acessar a aplicação:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Documentação API**: http://localhost:8000/docs
- **Banco de dados**: localhost:5432

### Credenciais de acesso:
- Username: `admin`
- Password: `admin123`

### Ver logs:
```bash
docker-compose logs -f
```

### Parar tudo:
```bash
docker-compose down
```

### Parar e remover volumes (limpar dados):
```bash
docker-compose down -v
```

## 📋 Serviços inclusos

1. **PostgreSQL** (porta 5432)
   - Banco de dados principal
   - Credenciais: orderflow_user / orderflow_password

2. **Backend FastAPI** (porta 8000)
   - API REST
   - Autenticação JWT
   - Documentação Swagger em /docs

3. **Frontend React** (porta 3000)
   - Aplicação OrderFlow
   - Build otimizado com Vite
   - Servido com `serve`

## 🔧 Desenvolvimento local (sem Docker)

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # ou venv\Scripts\activate no Windows
pip install -r requirements.txt
python main.py

# Frontend (em outro terminal)
npm install
npm run dev
```

## 📝 Estrutura

- `/backend` - FastAPI + SQLAlchemy
- `/src/orderflow` - Aplicação React principal
- `docker-compose.yml` - Orquestração de containers
- `Dockerfile.frontend` - Build do frontend
- `backend/Dockerfile` - Build do backend
