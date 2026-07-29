# Migração RBAC, Auditoria e Deploy

Este documento descreve as alterações implementadas para controle de acesso baseado em funções (RBAC), auditoria completa e atualização da infraestrutura de deploy.

## 1. Migração e Setup Inicial de Usuários

### Senha do Administrador
A senha do usuário administrador padrão foi definida como: `ramon@101020`

Configure através das variáveis de ambiente:
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ramon@101020
```

### Seed/Upgrade Automático
O script `backend/seed_db.py` foi atualizado para:
- Criar tabelas automaticamente
- Garantir colunas de RBAC (`perfil`, `nome`, `usuario_id`, `audit_logs`)
- Migrar usuários existentes com `is_admin=True` para `perfil='admin'`
- Atualizar/criar o usuário admin com a senha definida em `ADMIN_PASSWORD`

### Execução Automática
- **Docker**: O `backend/entrypoint.sh` executa `seed_db.py` antes de iniciar a aplicação
- **Local**: O `start.sh` executa `seed_db.py` antes de iniciar o backend
- **Deploy (Render/Railway/etc.)**: Use o `backend/build.sh` como script de build

## 2. Controle de Acesso (RBAC)

### Perfis
- `admin`: acesso total ao sistema
- `operador`: pode realizar vendas e operações comuns, mas **não pode** excluir/cancelar vendas

### Backend
- Middleware `require_admin` em `backend/app/routes/auth.py`
- Rotas de usuários e auditoria protegidas por `require_admin`
- Rotas de cancelar/excluir venda validam perfil do token JWT
- Token JWT inclui `perfil`, `user_id` e `nome`

### Frontend
- `AuthContext` expõe `isAdmin` e `isOperador`
- `PrivateRoute` com opção `requireAdmin`
- Botões de cancelar/excluir venda ocultos para operadores
- Dashboard só exibe menus de admin para usuários admin

## 3. Gestão de Usuários (CRUD)

Nova tela em `/usuarios` (apenas admin) com:
- Listagem de usuários
- Criação de usuário com senha inicial e perfil
- Edição de usuário
- Desativação/reativação
- Reset de senha

Endpoints:
- `GET/POST/PUT/DELETE /api/usuarios`
- `POST /api/usuarios/{id}/resetar-senha`
- `POST /api/usuarios/{id}/reativar`
- `GET /api/usuarios/perfil/opcoes`

## 4. Rastreabilidade e Auditoria

### Vendas
- Coluna `usuario_id` na tabela `vendas`
- Backend vincula venda ao usuário logado via token
- Frontend exibe "Registrado por: {usuario_nome}" na listagem e detalhes

### AuditLog
Tabela `audit_logs` registra:
- Ação (criar, editar, excluir, cancelar, concluir, login, logout, etc.)
- Entidade afetada (venda, produto, usuario, cliente, empresa)
- ID da entidade
- Descrição
- Endereço IP
- ID e nome do usuário responsável
- Data/hora

### Tela de Auditoria
Nova tela em `/auditoria` (apenas admin) com filtros por:
- Ação
- Entidade
- ID do usuário
- Data/hora início e fim

## 5. Segurança

- Todas as requisições API autenticadas via JWT Bearer token
- Senhas armazenadas com bcrypt através de `passlib`
- Permissões validadas no backend antes de operações de escrita
- Logout registra auditoria
- Troca de senha disponível para todos os usuários logados

## 6. Infraestrutura

### Docker
- `backend/Dockerfile` atualizado com entrypoint
- `backend/entrypoint.sh` executa migrations/seed automaticamente
- `docker-compose.yml` configurado com variáveis de ambiente

### Vercel
- `vercel.json` configurado para SPA estática
- Variável `VITE_API_URL` deve apontar para o backend hospedado separadamente
- Backend deve ser hospedado em serviço como Render/Railway com `backend/build.sh`

## Como Executar

### Localmente
```bash
./start.sh
```
Login: `admin` / `ramon@101020`

### Docker
```bash
docker-compose down -v  # limpar volume se necessário
docker-compose up --build
```

Se houver problemas de conexão com o banco de dados, certifique-se de que o volume do Postgres está limpo:
```bash
docker-compose down -v
docker-compose up --build
```

### Deploy do Backend
Configure o script de build para executar:
```bash
bash build.sh
```

### Deploy do Frontend (Vercel)
Configure `VITE_API_URL` apontando para a URL do backend.
