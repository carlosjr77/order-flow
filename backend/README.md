# Backend Order Flow

Este é o backend da aplicação Order Flow, desenvolvido em Python com FastAPI.

## Estrutura

- `app/`: Código principal da aplicação
  - `core/`: Configurações e dependências core (database, security, config)
  - `models/`: Modelos SQLAlchemy para banco de dados
  - `schemas/`: Schemas Pydantic para validação de dados
  - `routes/`: Rotas da API (auth, produtos, vendas)
  - `utils/`: Utilitários (OCR, processamento de arquivos)
- `requirements.txt`: Dependências do projeto

## Setup

1. **Instalar dependências**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Criar arquivo .env**:
   ```bash
   cp .env.example .env
   ```

3. **Configurar PostgreSQL**:
   - Criar banco de dados: `ordem_vendas`
   - Atualizar DATABASE_URL no .env

4. **Rodar a aplicação**:
   ```bash
   python main.py
   ```

A API estará disponível em `http://localhost:8000`

## Credenciais Padrão

- **Username**: admin
- **Password**: admin123

## API Endpoints

### Autenticação
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registro
- `GET /api/auth/me` - Dados do usuário

### Produtos
- `GET /api/produtos` - Listar produtos
- `GET /api/produtos/{id}` - Obter produto
- `POST /api/produtos` - Criar produto
- `PUT /api/produtos/{id}` - Atualizar produto
- `DELETE /api/produtos/{id}` - Deletar produto

### Vendas
- `GET /api/vendas` - Listar vendas
- `GET /api/vendas/{id}` - Obter venda
- `POST /api/vendas` - Criar venda
- `PUT /api/vendas/{id}/concluir` - Concluir venda
- `PUT /api/vendas/{id}/cancelar` - Cancelar venda
