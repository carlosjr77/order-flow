# 🚀 QUICK START - ORDER FLOW

## Passo 1: Backend (Terminal 1)
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Configurar .env
copy .env.example .env
# Edite .env com:
# DATABASE_URL=postgresql://postgres:senha@localhost:5432/ordem_vendas

python main.py
```
✅ Backend rodando em: http://localhost:8000

---

## Passo 2: Frontend (Terminal 2)
```bash
npm install
npm run dev
```
✅ Frontend rodando em: http://localhost:5173

---

## Passo 3: Acesso
1. Abra http://localhost:5173
2. Entre com:
   - **Usuário**: admin
   - **Senha**: admin123

---

## 🎯 Primeiro Uso

### 1. Adicionar Produtos
- Menu → Gestão de Produtos
- Novo Produto
- Preencha: Código, Descrição, Preço Custo, Preço Venda
- Salvar

### 2. Fazer uma Venda
- Menu → Frente de Caixa
- Busque um produto
- Clique para adicionar ao carrinho
- Selecione forma de pagamento
- Finalizar Venda
- PDF é gerado automaticamente

### 3. Ver Histórico
- Menu → Vendas
- Visualize todas as vendas
- Baixe comprovantes quando necessário

---

## 📊 Banco de Dados

Certifique-se que PostgreSQL está rodando:

```sql
CREATE DATABASE ordem_vendas;
CREATE USER orderflow WITH PASSWORD 'orderflow123';
GRANT ALL PRIVILEGES ON DATABASE ordem_vendas TO orderflow;
```

---

## 🔑 Credenciais Padrão

- **Admin Username**: admin
- **Admin Password**: admin123

---

## 📚 Documentação
- API Docs: http://localhost:8000/docs
- Backend: `/backend/README.md`
- Frontend: `/src/orderflow/README.md`
- Setup Completo: `SETUP_GUIDE.md`

---

## ✨ Features Principais

✅ Autenticação JWT  
✅ Dashboard com estatísticas  
✅ CRUD de Produtos  
✅ PDV (Frente de Caixa)  
✅ Histórico de Vendas  
✅ Comprovantes em PDF (DANFE-like)  
✅ Controle de Estoque Automático  

---

**Pronto para usar! 🎉**
