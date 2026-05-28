# PostgreSQL Setup para Order Flow

## 📥 Instalação do PostgreSQL no Windows

### Passo 1: Download
1. Acesse: https://www.postgresql.org/download/windows/
2. Clique em "Download the installer"
3. Selecione a versão 12 ou superior
4. Execute o instalador

### Passo 2: Instalação
1. Execute o arquivo `postgresql-XX-windows-x64.exe`
2. Siga os passos do instalador
3. **Importante**: Anote a senha do usuário `postgres`
4. Deixe a porta como `5432` (padrão)
5. Complete a instalação

### Passo 3: Criar Banco de Dados

#### Opção A: Usando pgAdmin (GUI)
1. Abra pgAdmin (instalado com PostgreSQL)
2. Clique em "Servers" → "Register" → "Server"
3. Conecte com localhost
4. Clique em "Databases" → Create → Database
5. Nome: `ordem_vendas`
6. Clique "Save"

#### Opção B: Usando Terminal (CMD)

```bash
# Abra CMD como Administrador

# Conectar ao PostgreSQL
psql -U postgres

# Entrar com a senha que você criou

# Criar banco de dados
CREATE DATABASE ordem_vendas;

# Criar usuário
CREATE USER orderflow WITH PASSWORD 'orderflow123';

# Dar permissões
GRANT ALL PRIVILEGES ON DATABASE ordem_vendas TO orderflow;

# Sair
\q
```

---

## 🔐 Configuração do Backend

No arquivo `/backend/.env`:

```
DATABASE_URL=postgresql://orderflow:orderflow123@localhost:5432/ordem_vendas
SECRET_KEY=sua-chave-super-secreta-aqui
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
API_PORT=8000
```

---

## ✅ Verificar Conexão

### Teste 1: Verificar se PostgreSQL está rodando
```bash
psql -U postgres -c "SELECT version();"
```

### Teste 2: Conectar ao banco order flow
```bash
psql -U orderflow -d ordem_vendas -c "SELECT 1;"
```

### Teste 3: Testar API
```bash
curl http://localhost:8000/health
```

Se retornar `{"status":"ok"}` ✅

---

## 🆘 Troubleshooting

### Erro: "role 'orderflow' does not exist"
```bash
psql -U postgres

CREATE USER orderflow WITH PASSWORD 'orderflow123';
GRANT ALL PRIVILEGES ON DATABASE ordem_vendas TO orderflow;
```

### Erro: "database 'ordem_vendas' does not exist"
```bash
psql -U postgres

CREATE DATABASE ordem_vendas;
GRANT ALL PRIVILEGES ON DATABASE ordem_vendas TO orderflow;
```

### Erro: "could not connect to server"
1. Verifique se PostgreSQL está rodando
2. Windows → Services → Procure "PostgreSQL"
3. Se não estiver rodando, clique com botão direito e "Start"

---

## 📊 Verificar Dados do Banco

### Ver todos os usuários
```bash
psql -U postgres -l
```

### Conectar ao banco e ver tabelas
```bash
psql -U orderflow -d ordem_vendas

\dt  # Lista todas as tabelas

SELECT * FROM produtos;  # Ver produtos
SELECT * FROM vendas;    # Ver vendas
SELECT * FROM usuarios;  # Ver usuários
```

---

## 🚀 Próximas Etapas

1. Instale PostgreSQL ✅
2. Crie o banco `ordem_vendas` ✅
3. Configure o backend ✅
4. Rode o backend: `python main.py`
5. Rode o frontend: `npm run dev`
6. Acesse http://localhost:5173

---

## 🔗 Links Úteis

- [PostgreSQL Download](https://www.postgresql.org/download/windows/)
- [pgAdmin](https://www.pgadmin.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

**Banco configurado e pronto! 🎉**
