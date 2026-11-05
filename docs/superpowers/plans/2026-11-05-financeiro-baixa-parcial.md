# Busca de títulos, baixa parcial e extrato: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir localizar títulos por cliente, registrar recebimentos parciais com alocação e crédito, e gerar o extrato do cliente.

**Architecture:** Livro de recebimentos com saldo sempre calculado a partir das alocações ativas. As regras ficam em `backend/app/utils/financeiro.py`, chamadas pelo novo router e pelas rotas de vendas. O frontend ganha a página `/financeiro`.

**Tech Stack:** FastAPI, SQLAlchemy 2, PostgreSQL, pytest, React, TypeScript, jsPDF, vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-financeiro-baixa-parcial-design.md`

## Global Constraints

- Valores financeiros usam `Decimal` no backend e centavos inteiros nos cálculos do frontend.
- Formas de recebimento avulso: `PIX`, `Boleto`, `Transferência`.
- Origens de recebimento: `avulso`, `conclusao`, `migracao`.
- Status financeiro: `aberto`, `parcial`, `liquidada`.
- Testes nunca usam o banco do `.env`: exigem `TEST_DATABASE_URL`, com `test` no nome do banco.
- Mensagens ao usuário em português.

## Review Focus

- Busca sem acento ou com acento ("Joao" encontra "João"): deve encontrar o cliente. Teste na Task 4.
- Busca com `%` ou `_`: deve ser tratada como texto literal. Teste na Task 4.
- Mesma venda repetida na lista de alocações: a soma das linhas não pode ultrapassar o saldo. Teste na Task 2.
- Valor com mais de duas casas decimais: deve ser rejeitado, sem arredondamento silencioso. Teste na Task 4.
- Duplo clique ao salvar recebimento: o modal desabilita o envio durante a requisição. Verificação manual na Task 6.

---

### Task 1: Modelos, schema e infraestrutura de testes

**Files:**
- Create: `backend/app/models/recebimento.py`, `backend/requirements-dev.txt`, `backend/tests/conftest.py`, `backend/tests/test_schema.py`
- Modify: `backend/app/models/venda.py`, `backend/app/models/__init__.py`, `backend/app/main.py`

**Interfaces:**
- Produces: `Recebimento`, `RecebimentoAlocacao` (relação `Recebimento.alocacoes`), `Venda.cliente_id`; fixtures `db`, `client`, `admin_headers`, `operador_headers`, `criar_cliente`, `criar_venda`.

- [ ] Testar que as tabelas e `vendas.cliente_id` existem e que `valor <= 0` viola o `CHECK`.
- [ ] Implementar modelos, `ADD COLUMN IF NOT EXISTS` em `run_migrations`, `conftest.py` com as travas de banco.
- [ ] Rodar: `pytest backend/tests/test_schema.py -v`. Esperado: PASS.
- [ ] Commit.

### Task 2: Regras financeiras

**Files:**
- Create: `backend/app/utils/financeiro.py`, `backend/tests/test_regras_financeiras.py`

**Interfaces:**
- Consumes: modelos da Task 1.
- Produces: `registrar_recebimento`, `alocar`, `estornar`, `concluir_venda`, `preparar_cancelamento`, `aplicar_edicao`, `vincular_cliente`, `mapa_pagos`, `status_financeiro`, `extrato_cliente`, `buscar_titulos`. Erros herdam de `HTTPException`.

- [ ] Testar: R$ 1.931,00 com R$ 1.500,00 resulta em `parcial` e saldo de R$ 431,00; R$ 3.000,00 em várias notas com sobra em crédito; alocação acima do saldo, inclusive venda repetida; estorno; concluir, editar, cancelar por origem; invariante do extrato; duas alocações simultâneas.
- [ ] Implementar `utils/financeiro.py`, com travas `FOR UPDATE`.
- [ ] Rodar: `pytest backend/tests/test_regras_financeiras.py -v`. Esperado: PASS.
- [ ] Commit.

### Task 3: Migração de dados e rotas de vendas

**Files:**
- Create: `backend/app/utils/financeiro_migracao.py`, `backend/tests/test_migracao.py`, `backend/tests/test_vendas_financeiro.py`
- Modify: `backend/app/routes/vendas.py`, `backend/app/schemas/__init__.py`, `backend/app/main.py`

**Interfaces:**
- Produces: `migrar_dados_financeiros(engine)`; `GET /api/vendas` com `cliente_id`, `valor_pago`, `saldo`, `status_financeiro`.

- [ ] Testar vínculo por nome único, ambíguo e ausente; recebimentos históricos; nova execução sem duplicidade; rotas `concluir`, `cancelar`, `excluir`, `PUT` com as regras.
- [ ] Implementar a migração e integrar as rotas.
- [ ] Rodar: `pytest backend/tests -v`. Esperado: PASS.
- [ ] Commit.

### Task 4: API financeira

**Files:**
- Create: `backend/app/routes/financeiro.py`, `backend/tests/test_api_financeiro.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: funções da Task 2.
- Produces: endpoints da seção API da spec.

- [ ] Testar cada filtro de `/titulos`, documento com e sem máscara, busca sem acento, `%` literal, paginação e totais; valor com três casas retorna 422; data futura retorna 400; estorno por operador retorna 403; extrato; vínculo.
- [ ] Implementar o router com auditoria.
- [ ] Rodar: `pytest backend/tests -v`. Esperado: PASS.
- [ ] Commit.

### Task 5: Utilitários e cliente de API no frontend

**Files:**
- Create: `src/orderflow/utils/financeiro.ts`, `src/orderflow/utils/financeiro.test.ts`, `src/orderflow/utils/gerarExtratoCliente.ts`
- Modify: `src/orderflow/types/index.ts`, `src/orderflow/services/api.ts`

**Interfaces:**
- Produces: `sugerirDistribuicao`, `resumirDistribuicao`, `montarMensagemWhatsApp`, `montarUrlWhatsApp`, `gerarExtratoClientePdf`; métodos de API; tipos `TituloFinanceiro`, `ExtratoCliente`.

- [ ] Testar distribuição por vencimento, centavos, sobra em crédito, texto e URL do WhatsApp.
- [ ] Implementar.
- [ ] Rodar: `npx vitest run src/orderflow/utils/financeiro.test.ts`. Esperado: PASS.
- [ ] Commit.

### Task 6: Telas

**Files:**
- Create: `src/orderflow/pages/FinanceiroPage.tsx`, `src/orderflow/components/financeiro/RecebimentoModal.tsx`, `src/orderflow/components/financeiro/ExtratoClienteDialog.tsx`, `src/orderflow/components/financeiro/ClienteAutocomplete.tsx`
- Modify: `src/orderflow/OrderFlowApp.tsx`, `src/orderflow/pages/DashboardPage.tsx`, `src/orderflow/pages/VendasPage.tsx`, `src/orderflow/pages/PDVPage.tsx`

- [ ] Implementar a página, o modal, o extrato, a aba "Sem cliente", o selo em Vendas e o `cliente_id` no PDV.
- [ ] Rodar: `npx tsc -p tsconfig.app.json --noEmit` e `npm run build`. Esperado: sem novos erros.
- [ ] Percorrer o fluxo no navegador com banco de teste.
- [ ] Commit.
