# GUIA COMPLETO DE INSTALAÇÃO E USO - ORDER FLOW

## 🎯 Objetivo do Sistema

Sistema web completo de **Gestão de Vendas, Estoque e Emissão de Pedidos Não Fiscais** com:
- Dashboard com estatísticas
- Gestão de produtos
- Frente de caixa (PDV)
- Emissão de comprovantes em formato DANFE (sem elementos fiscais)
- Importação de notas via OCR (em desenvolvimento)

---

## 🔧 PRÉ-REQUISITOS

### Backend
- Python 3.10+
- PostgreSQL 12+
- pip

### Frontend
- Node.js 18+
- npm ou yarn

---

## 📦 INSTALAÇÃO

### 1️⃣ Banco de Dados

#### Windows
```bash
# Instalar PostgreSQL (https://www.postgresql.org/download/windows/)
# Depois de instalado, criar banco de dados:

psql -U postgres
# Entrar com a senha que você criou durante a instalação

CREATE DATABASE ordem_vendas;
CREATE USER orderflow WITH PASSWORD 'orderflow123';
GRANT ALL PRIVILEGES ON DATABASE ordem_vendas TO orderflow;
\\q
```

---

### 2️⃣ Backend (Python + FastAPI)

```bash
# 1. Abrir terminal e ir para a pasta backend
cd c:\Projetos\order-flow\backend

# 2. Criar ambiente virtual
python -m venv venv

# 3. Ativar ambiente virtual
# No Windows:
venv\Scripts\activate

# 4. Instalar dependências
pip install -r requirements.txt

# 5. Configurar .env
# Copie .env.example para .env e configure:
copy .env.example .env

# Edite .env com seus dados:
DATABASE_URL=postgresql://orderflow:orderflow123@localhost:5432/ordem_vendas
SECRET_KEY=sua-chave-secreta-muito-segura-aqui
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# 6. Rodar migrações (cria tabelas)
# As tabelas são criadas automaticamente ao iniciar a app

# 7. Iniciar o servidor
python main.py
```

**Saída esperada:**
```
Uvicorn running on http://0.0.0.0:8000
```

**Acesse:**
- API: http://localhost:8000
- Documentação: http://localhost:8000/docs

---

### 3️⃣ Frontend (React + Vite)

```bash
# 1. Abrir novo terminal na raiz do projeto
cd c:\Projetos\order-flow

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente (opcional)
# Crie arquivo .env.local na raiz (opcional)
VITE_API_URL=http://localhost:8000

# 4. Iniciar servidor de desenvolvimento
npm run dev
```

**Saída esperada:**
```
VITE v5.x.x building for development...

  ➜  Local:   http://localhost:5173/
```

---

## 🚀 PRIMEIRO ACESSO

1. Abra http://localhost:5173 no navegador
2. Entre com as credenciais:
   - **Usuário**: admin
   - **Senha**: admin123

3. Será redirecionado para o Dashboard

---

## 📊 USANDO O SISTEMA

### Dashboard
- Visualizar estatísticas gerais
- Acessar os módulos principais

### Gestão de Produtos
1. Clique em "Gestão de Produtos"
2. Clique em "Novo Produto"
3. Preencha os dados:
   - Código Interno (único)
   - Descrição
   - Preço de Custo
   - Preço de Venda
   - Unidade de Medida (UN, KG, LT, CX)
   - NCM (opcional)
4. Clique em "Salvar"

### Frente de Caixa (PDV)
1. Clique em "Frente de Caixa"
2. Busque produtos pelo código ou descrição
3. Clique no produto para adicionar ao carrinho
4. Ajuste quantidades conforme necessário
5. Selecione forma de pagamento
6. Clique em "Finalizar Venda"
7. Um PDF será gerado automaticamente

### Vendas
1. Veja o histórico de todas as vendas
2. Clique em "Ver Detalhes" para mais informações
3. Clique em "Baixar PDF" para gerar comprovante
4. Gerencie o status (Concluir/Cancelar)

---

## 📋 ESTRUTURA DO BANCO DE DADOS

### Tabela: produtos
```sql
- id (serial) - Identificador único
- codigo_interno (varchar) - Código do produto
- descricao (varchar) - Descrição
- preco_custo (decimal) - Preço de custo
- preco_venda (decimal) - Preço de venda
- estoque_atual (decimal) - Quantidade em estoque
- unidade_medida (varchar) - UN, KG, LT, CX
- ncm (varchar) - Código NCM (opcional)
```

### Tabela: vendas
```sql
- id (serial) - Identificador único
- data_venda (timestamp) - Data/hora da venda
- valor_total (decimal) - Valor total
- status (varchar) - pendente, concluído, cancelado
- forma_pagamento (varchar) - Dinheiro, Crédito, Débito, PIX
- observacoes (varchar) - Notas adicionais
```

### Tabela: itens_venda
```sql
- id (serial) - Identificador único
- venda_id (int) - Referência à venda
- produto_id (int) - Referência ao produto
- quantidade (decimal) - Quantidade vendida
- valor_unitario (decimal) - Preço unitário
- valor_total (decimal) - Subtotal do item
```

---

## 🎨 LAYOUT DO COMPROVANTE

O comprovante segue o padrão DANFE mas sem elementos fiscais:

```
═════════════════════════════════════════════
        SUA EMPRESA LTDA
     CNPJ: 00.000.000/0000-00
  Endereço, 123 - Bairro, Cidade, Estado
═════════════════════════════════════════════
     DOCUMENTO AUXILIAR DE VENDA
           Sem Valor Fiscal
═════════════════════════════════════════════

Data: 01/01/2024    Hora: 14:30:00   Pedido: 1

Forma de Pagamento: Dinheiro

─────────────────────────────────────────────
CÓD. | DESCRIÇÃO | NCM | UNID | QTD | VLR.UNIT. | VLR.TOTAL
─────────────────────────────────────────────
001  | PRODUTO 1 |     | UN   | 2   | R$ 10.00  | R$ 20.00
002  | PRODUTO 2 |     | UN   | 1   | R$ 15.00  | R$ 15.00
─────────────────────────────────────────────

                VALOR TOTAL DOS PRODUTOS: R$ 35.00

Informações Complementares:
Este é um Documento Auxiliar de Venda - Sem Valor Fiscal.
Não substitui a Nota Fiscal Eletrônica.
═════════════════════════════════════════════
```

---

## ⚙️ API ENDPOINTS

### Autenticação
```
POST   /api/auth/login         - Login do usuário
POST   /api/auth/register      - Registro de novo usuário
GET    /api/auth/me            - Dados do usuário atual
```

### Produtos
```
GET    /api/produtos           - Listar produtos
GET    /api/produtos/{id}      - Obter produto específico
POST   /api/produtos           - Criar novo produto
PUT    /api/produtos/{id}      - Atualizar produto
DELETE /api/produtos/{id}      - Deletar produto
PUT    /api/produtos/{id}/estoque/adicionar   - Adicionar estoque
PUT    /api/produtos/{id}/estoque/remover     - Remover estoque
```

### Vendas
```
GET    /api/vendas             - Listar vendas
GET    /api/vendas/{id}        - Obter venda específica
POST   /api/vendas             - Criar nova venda
PUT    /api/vendas/{id}/concluir  - Concluir venda
PUT    /api/vendas/{id}/cancelar  - Cancelar venda
```

---

## 🔒 Autenticação

O sistema usa JWT (JSON Web Tokens) para autenticação:

1. **Login**: Envia username/password e recebe um token
2. **Requisições**: Token é enviado no header `Authorization: Bearer {token}`
3. **Expiração**: Token expira em 30 minutos

---

## 🐛 Solução de Problemas

### "Connection refused on localhost:8000"
- Certifique-se que o backend está rodando: `python main.py`

### "PostgreSQL connection failed"
- Verifique se PostgreSQL está rodando
- Confirme as credenciais em `.env`
- Verifique se o banco de dados foi criado

### "VITE_API_URL not found"
- O frontend usa `http://localhost:8000` por padrão
- Se mudar a porta, configure em `.env.local`

### Produtos não aparecem no PDV
- Verifique se foram criados produtos na Gestão de Produtos
- Confira se o estoque está maior que zero

---

## 📝 Funcionalidades em Desenvolvimento

🔄 **OCR de Notas**
- Upload de PDF/Imagem de nota de fornecedor
- Extração automática de dados com OCR
- Importação de produtos com estoque

---

## 📞 Contato & Suporte

Para dúvidas sobre o sistema:
- Documentação API: http://localhost:8000/docs
- Frontend rodando em: http://localhost:5173

---

## 📄 Licença

Este projeto é fornecido como está para uso comercial.

---

**Última atualização**: Janeiro 2024
**Versão**: 1.0.0
