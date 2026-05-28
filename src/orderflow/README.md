# Order Flow - Sistema de Gestão de Vendas e Estoque

Um sistema web completo desenvolvido com React + Vite (Frontend), FastAPI (Backend) e PostgreSQL (Banco de Dados).

## 📋 Características

- ✅ **Autenticação**: Login com usuário e senha fixos (admin/admin123)
- ✅ **Dashboard**: Visão geral de estatísticas
- ✅ **Gestão de Produtos**: CRUD de produtos com busca
- ✅ **Frente de Caixa (PDV)**: Interface de checkout rápida
- ✅ **Gestão de Vendas**: Histórico e controle de vendas
- ✅ **Comprovantes**: Geração de PDF em formato DANFE (sem elementos fiscais)
- ✅ **Controle de Estoque**: Atualização automática ao realizar vendas
- 🔄 **OCR de Notas**: Em desenvolvimento (para importar notas de fornecedor)

## 🚀 Quick Start

### Backend (Python)

```bash
# Entrar no diretório backend
cd backend

# Instalar dependências
pip install -r requirements.txt

# Configurar .env
cp .env.example .env

# Executar
python main.py
```

API rodará em: `http://localhost:8000`

**Credenciais Padrão:**
- Username: `admin`
- Password: `admin123`

### Frontend (React)

```bash
# Instalar dependências
npm install

# Executar desenvolvimento
npm run dev

# Build para produção
npm run build
```

Frontend rodará em: `http://localhost:5173`

## 📁 Estrutura de Pastas

### Backend
```
backend/
├── app/
│   ├── core/          # Config, database, security
│   ├── models/        # SQLAlchemy models
│   ├── routes/        # API endpoints
│   ├── schemas/       # Pydantic schemas
│   └── utils/         # Utilitários (OCR, etc)
├── main.py            # Entrypoint
└── requirements.txt   # Dependências
```

### Frontend
```
src/orderflow/
├── pages/             # Páginas principais
├── components/        # Componentes React
├── services/          # API client
├── contexts/          # React contexts
├── hooks/             # Custom hooks
├── types/             # TypeScript types
└── utils/             # Utilitários (PDF, etc)
```

## 🔑 Credenciais de Acesso

| Campo | Valor |
|-------|-------|
| Username | admin |
| Password | admin123 |

## 📊 Endpoints da API

### Autenticação
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Dados do usuário

### Produtos
- `GET /api/produtos` - Listar
- `POST /api/produtos` - Criar
- `PUT /api/produtos/{id}` - Atualizar
- `DELETE /api/produtos/{id}` - Deletar
- `PUT /api/produtos/{id}/estoque/adicionar` - Adicionar estoque
- `PUT /api/produtos/{id}/estoque/remover` - Remover estoque

### Vendas
- `GET /api/vendas` - Listar
- `POST /api/vendas` - Criar
- `GET /api/vendas/{id}` - Obter detalhes
- `PUT /api/vendas/{id}/concluir` - Concluir
- `PUT /api/vendas/{id}/cancelar` - Cancelar

## 📝 Notas

- O sistema está configurado para PostgreSQL. Configure a URL do banco em `backend/.env`
- Os comprovantes PDF seguem o padrão DANFE mas sem elementos fiscais
- OCR está em desenvolvimento para importação de notas de fornecedores

## 🛠 Tecnologias

**Frontend:**
- React 19
- Vite
- TypeScript
- TailwindCSS
- React Router
- jsPDF

**Backend:**
- Python 3.10+
- FastAPI
- SQLAlchemy
- PostgreSQL
- JWT para autenticação
- Tesseract (OCR)

## 📞 Suporte

Para dúvidas ou problemas, consulte a documentação da API em:
`http://localhost:8000/docs`
