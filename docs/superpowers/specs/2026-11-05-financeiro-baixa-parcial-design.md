# Design: busca de títulos, baixa parcial e extrato do cliente

## Objetivo

Eliminar o controle de saldos em planilhas externas. A equipe precisa encontrar as notas de um cliente em qualquer período, registrar pagamentos avulsos que abatem uma ou mais notas, parcial ou totalmente, e gerar o extrato financeiro do cliente em tela, PDF e WhatsApp.

## Situação atual

- Não existe conceito de baixa ou saldo. A venda tem `status` `pendente`, `concluído` ou `cancelado`, e "Concluir" apenas troca o status.
- A NF-e é opcional e fica em `nfes`. O título a cobrar é, portanto, a venda.
- `vendas` guarda o cliente apenas como texto em `nome_cliente`, sem chave para `clientes`. O PDV também aceita nome digitado à mão.
- A tela de Vendas carrega até 1.000 registros, sem ordenação no backend, e filtra no navegador.
- O repositório não tem testes automatizados.

## Decisões

| Tema | Decisão |
|---|---|
| Significado de `concluído` | Significa pago: `concluído` equivale a "Liquidada" e `pendente` a "Em aberto" ou "Pago Parcialmente" |
| Vínculo de vendas ao cliente | Por nome normalizado, ao iniciar a API, por `backend/vincular_clientes.py` e ao criar, editar ou concluir venda. Nome sem cadastro cria o cliente, sem documento. Só ficam na lista de revisão manual as vendas sem nome ou com mais de um cadastro de mesmo nome. Esta decisão substitui a revisão manual de todos os nomes sem correspondência |
| Filtros na tela de Vendas | `GET /api/vendas` aceita `busca`, `cliente_id`, `status_financeiro`, `tipo_data`, `data_inicio` e `data_fim`, e ordena da venda mais recente para a mais antiga |
| Recebimento não distribuído | O valor restante vira crédito do cliente, que pode ser usado depois |
| Arquitetura | Livro de recebimentos, com saldo e status financeiro sempre calculados a partir das alocações |

## Escopo

**Inclui:** busca filtrada de títulos, recebimentos avulsos com alocação, crédito do cliente, estorno, extrato em tela, PDF e WhatsApp, vínculo de vendas a clientes e migração dos dados existentes.

**Não inclui:**

- Juros, multa e desconto.
- Conciliação bancária e geração de boletos.
- Integração com a API oficial do WhatsApp.
- Alteração do limite de 1.000 registros da tela de Vendas, já que a busca completa fica em `/financeiro`.
- Alteração da busca de cliente por nome na emissão de NF-e (`routes/fiscal.py:50`).

## Modelo de dados

### `recebimentos` (nova)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | integer PK | |
| `cliente_id` | FK `clientes.id`, nula, indexada | Obrigatória quando `origem = avulso` |
| `data_pagamento` | date | Não pode ser futura |
| `forma_pagamento` | varchar(50) | Em `avulso`: `PIX`, `Boleto` ou `Transferência` |
| `valor_total` | numeric(12,2) | `CHECK (valor_total > 0)` |
| `origem` | varchar(20) | `avulso`, `conclusao` ou `migracao` |
| `observacoes` | varchar(255), nula | |
| `usuario_id` | FK `usuarios.id`, nula | Quem registrou |
| `created_at` | timestamp | |
| `estornado_em` | timestamp, nula | Preenchida indica recebimento estornado |
| `estornado_por_id` | FK `usuarios.id`, nula | |
| `motivo_estorno` | varchar(255), nula | Obrigatório em estorno manual |

### `recebimento_alocacoes` (nova)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | integer PK | |
| `recebimento_id` | FK `recebimentos.id`, indexada | |
| `venda_id` | FK `vendas.id`, indexada | |
| `valor` | numeric(12,2) | `CHECK (valor > 0)` |
| `created_at` | timestamp | |

Alocações são imutáveis. Uma venda pode receber várias alocações do mesmo recebimento, pois o crédito pode ser usado aos poucos. O efeito de uma alocação termina somente quando o recebimento dela é estornado.

### `vendas` (alterada)

Adiciona `cliente_id` (FK `clientes.id`, nula, indexada). `nome_cliente` continua existindo, porque comprovantes e relatórios o utilizam.

### Mecanismo de migração

As tabelas novas são criadas por `Base.metadata.create_all`, e a coluna nova por `run_migrations` em `backend/app/main.py`, seguindo o mecanismo das alterações recentes do projeto.

## Regras financeiras

### Cálculos

Consideram somente alocações de recebimentos não estornados e vendas não canceladas nem excluídas.

- `valor_pago(venda)` = soma das alocações da venda.
- `saldo(venda)` = `valor_total` − `valor_pago`.
- Status financeiro:
  - **Em aberto:** `valor_pago = 0` e `saldo > 0`.
  - **Pago Parcialmente:** `valor_pago > 0` e `saldo > 0`.
  - **Liquidada:** `saldo <= 0`.
- `credito(cliente)` = soma de `valor_total` dos recebimentos do cliente − soma das alocações desses recebimentos.
- `saldo_liquido(cliente)` = soma dos saldos das vendas do cliente − `credito`. Um valor negativo é exibido como "saldo a favor do cliente".

**Invariante:** `saldo_liquido = total bruto das vendas − total de recebimentos não estornados`. Os testes verificam essa igualdade e a tela não a usa como cálculo alternativo.

Todos os cálculos usam `Decimal`, nunca `float`.

### Alocação

Uma alocação só é aceita se todas as condições forem verdadeiras:

- O `valor` é maior que zero e não ultrapassa o saldo atual da venda.
- A venda pertence ao mesmo cliente do recebimento e não está cancelada nem excluída.
- A soma das alocações não ultrapassa o valor ainda disponível no recebimento.
- O recebimento não está estornado.

A operação inteira ocorre em uma transação. Vendas e recebimento são travados com `SELECT ... FOR UPDATE`, em ordem crescente de `id`, para impedir pagamento acima do saldo em operações simultâneas e evitar deadlocks. Se uma validação falhar, nada é gravado.

### Sincronização do status da venda

Sempre que alocações mudam, em vendas com status `pendente` ou `concluído`:

- `saldo <= 0` define o status como `concluído`.
- `saldo > 0` define o status como `pendente`.

### Concluir venda

`PUT /api/vendas/{id}/concluir`:

- Rejeita venda cancelada com 409.
- Se `saldo > 0`, cria um recebimento com `origem = conclusao`, valor igual ao saldo, data de hoje, `forma_pagamento` da venda (ou `Não informado`) e `cliente_id` da venda, que pode ser nulo, além da alocação correspondente.
- Define o status como `concluído`.

### Editar venda

`PUT /api/vendas/{id}`:

1. Rejeita com 409 se o novo total for menor que a soma das alocações de origem `avulso`.
2. Se a venda já estava `concluído` por um recebimento de origem `conclusao` ou `migracao`, ou se a requisição pede `status = concluído`, e o total mudou ou há saldo, estorna os recebimentos dessas origens e cria um novo de origem `conclusao` para o saldo restante. O status final é `concluído`.
3. Nos demais casos, sincroniza o status a partir do saldo.

### Cancelar ou excluir venda

- Rejeita com 409 se houver alocação ativa de origem `avulso`, com mensagem orientando estornar primeiro.
- Recebimentos ativos de origem `conclusao` ou `migracao` da venda são estornados automaticamente, com motivo gerado pelo sistema, na mesma transação.

### Estorno

- Somente perfil `admin`, com motivo obrigatório.
- Marca o recebimento como estornado, sem apagar nada, e sincroniza o status das vendas alocadas.
- Recebimentos não são editados nem excluídos. Para corrigir, a equipe estorna e lança novamente.
- Estornar um recebimento já estornado retorna 409.

### Vínculo de venda a cliente

- `PUT /api/financeiro/vendas/{id}/cliente` define `cliente_id` e propaga o cliente para os recebimentos de origem `conclusao` ou `migracao` da venda.
- Rejeita com 409 se a venda já tiver alocação ativa de origem `avulso` de outro cliente.
- Não altera `nome_cliente`.

## Migração de dados

Roda na inicialização, depois de `run_migrations`, dentro de uma transação protegida por `pg_advisory_xact_lock`, para instâncias simultâneas não repetirem o trabalho. Pode rodar várias vezes sem efeito adicional.

1. **Vínculo de clientes:** para vendas com `cliente_id` nulo e `nome_cliente` preenchido, compara nomes normalizados em Python (minúsculas, sem acentos, espaços colapsados). Só vincula quando há exatamente um cliente com o nome normalizado. Nomes com vários cadastros ou nenhum ficam sem vínculo.
2. **Recebimentos históricos:** para cada venda com status `concluído` ou `concluido`, não excluída, com `valor_total > 0` e sem nenhuma alocação, inclusive de recebimento estornado, cria um recebimento de origem `migracao` com:
   - `data_pagamento` igual à data de `data_venda`;
   - `forma_pagamento` da venda, ou `Não informado`;
   - `cliente_id` da venda.

A data real de pagamento dessas vendas é desconhecida, e `data_venda` é uma aproximação. O extrato identifica esses lançamentos como "Baixa anterior ao módulo financeiro".

**Implantação:** fazer backup do banco antes da primeira execução em produção.

## API

Novo router `backend/app/routes/financeiro.py`, com prefixo `/api/financeiro`. As regras ficam em `backend/app/utils/financeiro.py`, testáveis sem HTTP. Todos os endpoints exigem usuário autenticado. Operações que gravam dados chamam `registrar_auditoria`.

### `GET /titulos`

Parâmetros, todos opcionais:

- `busca`: parte do nome ou do CPF/CNPJ do cliente. A comparação do documento usa só dígitos, com `regexp_replace`, e aceita entrada com ou sem máscara. Vendas sem vínculo são pesquisadas por `nome_cliente`.
- `cliente_id`.
- `status`: `aberto`, `parcial` ou `liquidada`.
- `tipo_data`: `emissao` (`data_venda`, padrão) ou `vencimento` (`data_vencimento`).
- `data_inicio`, `data_fim`: intervalo inclusivo. Sem elas, não há limite de período.
- `pagina` (padrão 1), `limite` (padrão 50, máximo 100).

O status é filtrado em SQL, por uma subconsulta agregada de alocações, para a paginação e os totais ficarem corretos. A ordenação é por vencimento, com nulos no final, depois por `id` decrescente, para a paginação ser estável.

Resposta:

```json
{
  "itens": [{
    "venda_id": 123,
    "numero_nfe": 456,
    "cliente_id": 7,
    "cliente_nome": "Mercado Exemplo",
    "cliente_documento": "00.000.000/0001-00",
    "data_emissao": "2026-08-10",
    "data_vencimento": "2026-09-10",
    "valor_original": 1931.00,
    "valor_pago": 1500.00,
    "saldo": 431.00,
    "status_financeiro": "parcial"
  }],
  "total": 1,
  "pagina": 1,
  "limite": 50,
  "totais": { "valor_original": 1931.00, "valor_pago": 1500.00, "saldo": 431.00 }
}
```

`numero_nfe` vem da NF-e com `status = "autorizada"`, ou é nulo. `totais` cobre todo o resultado filtrado, não só a página.

### `POST /recebimentos`

```json
{
  "cliente_id": 7,
  "data_pagamento": "2026-11-05",
  "forma_pagamento": "PIX",
  "valor_total": 3000.00,
  "observacoes": null,
  "alocacoes": [{ "venda_id": 123, "valor": 1500.00 }]
}
```

`alocacoes` pode ser vazia, e todo o valor vira crédito. Retorna o recebimento, as alocações e o crédito restante dele.

### Demais endpoints

| Endpoint | Descrição |
|---|---|
| `POST /recebimentos/{id}/alocacoes` | Corpo `{ "alocacoes": [...] }`. Usa o valor disponível de um recebimento |
| `POST /recebimentos/{id}/estornar` | Corpo `{ "motivo": "..." }`. Somente admin |
| `GET /clientes/{id}/extrato` | Extrato calculado no momento da requisição |
| `GET /vendas-sem-cliente` | Vendas não excluídas e não canceladas com `cliente_id` nulo. Paginado |
| `PUT /vendas/{id}/cliente` | Corpo `{ "cliente_id": 7 }` |

### Formato do extrato

```json
{
  "cliente": { "id": 7, "nome": "...", "documento": "...", "telefone": "..." },
  "resumo": {
    "total_bruto": 10531.00,
    "total_em_aberto": 7531.00,
    "total_recebido": 3000.00,
    "total_recebido_avulso": 3000.00,
    "credito_disponivel": 0.00,
    "saldo_liquido": 7531.00
  },
  "titulos": [],
  "recebimentos": [],
  "gerado_em": "2026-11-05T10:30:00"
}
```

`titulos` traz data, descrição (`NF-e nº X` quando houver, senão `Pedido #id`), vencimento, valor original, valor pago, saldo e status. `recebimentos` traz data, forma, valor, origem, alocações, `valor_disponivel` e dados de estorno. Recebimentos estornados aparecem no histórico, mas não entram nos totais.

### Alterações em rotas existentes

- `VendaCreate`, `VendaUpdate` e as respostas de venda ganham `cliente_id`. As respostas de `GET /api/vendas` ganham `valor_pago`, `saldo` e `status_financeiro`, calculados em lote para não gerar uma consulta por venda.
- `concluir`, `cancelar`, `excluir` e `editar` aplicam as regras acima e passam a usar as funções de `utils/financeiro.py`.

### Erros

| Código | Situação |
|---|---|
| 400 | Dados inválidos, como data futura, forma de pagamento desconhecida ou alocações acima do valor do recebimento |
| 403 | Estorno sem perfil admin |
| 404 | Cliente, venda ou recebimento inexistente |
| 409 | Conflito com o estado atual, como saldo menor que a alocação, venda com recebimento avulso ou recebimento já estornado |

As mensagens são em português e informam o que a equipe deve fazer.

## Frontend

### Página `/financeiro`

Nova rota protegida em `OrderFlowApp.tsx`, com card no Dashboard. Fica em `src/orderflow/pages/FinanceiroPage.tsx`, com componentes em `src/orderflow/components/financeiro/`.

**Aba "Títulos":**

- Campo de busca com autocomplete, usando `GET /api/clientes?busca=` e o hook `useDebounce` existente. Enter pesquisa o texto digitado.
- Filtros de status, tipo de data e intervalo.
- Tabela paginada com cliente, documento, número, emissão, vencimento, valor original, pago, saldo e status, e totais do resultado.
- Ações por linha: "Receber" abre o modal com cliente e nota pré-selecionados, e "Ver extrato" abre o extrato.
- O botão "Registrar recebimento" abre o modal vazio.
- Estados de carregamento, lista vazia e erro.

**Aba "Sem cliente":** lista as vendas sem vínculo e permite escolher o cliente com o mesmo autocomplete.

### `RecebimentoModal`

- Campos: cliente, data (padrão hoje), forma de pagamento e valor recebido.
- Ao escolher o cliente, carrega `GET /clientes/{id}/extrato`, que fornece as notas com saldo e os recebimentos com `valor_disponivel > 0`.
- Lista as notas com saldo do cliente e sugere a distribuição por vencimento mais antigo, com vencimentos nulos por último, depois por `id`.
- Valores editáveis por nota, limitados ao saldo. O resumo mostra alocado e crédito em tempo real.
- Mostra o crédito disponível do cliente e permite usá-lo em notas, por `POST /recebimentos/{id}/alocacoes`.
- Desabilita o envio durante a requisição, para evitar lançamento duplicado.
- Depois de salvar, a lista recarrega e os erros do backend ficam visíveis no modal.

A sugestão de distribuição é uma função pura em `src/orderflow/utils/financeiro.ts`. Ela apenas pré-preenche os campos, e o backend revalida tudo.

### `ExtratoClienteDialog`

- Cartões: total bruto, total em aberto, total recebido, crédito disponível e saldo líquido.
- Tabela de títulos: data, descrição/número, valor original, valor pago e saldo restante.
- Histórico de recebimentos, com estornados identificados, e botão "Estornar" apenas para admin, pedindo o motivo.
- Botões "Exportar PDF" e "Enviar por WhatsApp".

### PDF e WhatsApp

`src/orderflow/utils/gerarExtratoCliente.ts` gera o PDF com `jsPDF` e `jspdf-autotable`, no padrão de `gerarRelatorioVendas.ts`.

- **Com `navigator.canShare({ files })`, comum em celulares:** abre o compartilhamento nativo com o PDF.
- **Sem esse recurso, comum em computadores:** baixa o PDF e abre `https://wa.me/55<telefone>?text=<resumo>`. O texto traz nome do cliente, totais e saldo. O usuário anexa o arquivo manualmente, porque `wa.me` não aceita anexos. A interface avisa isso.
- **Sem telefone cadastrado ou inválido:** abre `wa.me` sem destinatário, para o usuário escolher o contato.

### Telas existentes

- **Vendas:** selo de status financeiro e saldo restante em cada venda. O restante não muda.
- **PDV:** envia `cliente_id` ao salvar quando `clienteSelecionado` existe, e ao editar preserva o `cliente_id` da venda. Nome digitado à mão gera venda sem vínculo, que aparece na aba "Sem cliente".
- **`services/api.ts` e `types/index.ts`:** recebem os novos métodos e tipos.

## Testes

### Backend

Novos testes em `backend/tests/` com pytest e `httpx` para o `TestClient`, adicionados a um `backend/requirements-dev.txt`.

O projeto importa `app.main` e cria tabelas na hora, e as consultas usam recursos do Postgres. Portanto, os testes exigem a variável `TEST_DATABASE_URL`, apontando para um Postgres de teste. O `conftest.py` define `DATABASE_URL` com esse valor antes de qualquer import de `app`, recusa nomes de banco que não contenham `test` e aborta se a variável não existir. Assim, o banco do `.env` nunca é usado.

Cenários:

- **Saldo:** exemplo do pedido, nota de R$ 1.931,00 com R$ 1.500,00 pagos resulta em "Pago Parcialmente" e saldo de R$ 431,00.
- **Distribuição:** R$ 3.000,00 em várias notas, em que parte fica liquidada, parte fica parcial e a sobra vira crédito.
- **Validações:** alocação acima do saldo ou do recebimento, venda de outro cliente, venda cancelada e data futura, sempre sem gravar nada em caso de falha.
- **Crédito:** uso posterior do crédito e valor negativo de saldo líquido.
- **Estorno:** reabre o saldo, volta o status para `pendente`, exige admin e rejeita repetição.
- **Vendas:** concluir com e sem saldo parcial, editar acima e abaixo do valor pago, cancelar e excluir com cada origem de recebimento.
- **Migração:** vínculo com nome único, ambíguo e ausente, criação de recebimentos históricos e nova execução sem duplicidade.
- **Busca:** cada filtro, documento com e sem máscara, notas de meses diferentes, paginação e totais.
- **Invariante do extrato:** `saldo_liquido = total_bruto − total_recebido` em todos os cenários acima.
- **Concorrência:** duas alocações simultâneas na mesma nota não ultrapassam o saldo.

### Frontend

Testes com vitest para a sugestão de distribuição, o cálculo de totais do modal, incluindo arredondamento em centavos, e o texto e a URL do WhatsApp.

### Verificação manual

Rodar o aplicativo com uma cópia dos dados ou dados de exemplo e percorrer o fluxo: buscar cliente, registrar recebimento parcial, abrir o extrato, exportar o PDF, usar o WhatsApp e estornar.

## Riscos

- **Vínculo incompleto:** vendas sem vínculo ficam fora do extrato até serem revisadas. A aba "Sem cliente" torna isso visível, e os pendentes devem ser revisados logo após a implantação.
- **`concluído` nem sempre significar pago no passado:** venda histórica não paga, mas concluída, aparecerá como liquidada. O estorno do recebimento de migração reabre a venda.
- **Total recebido histórico inflado por lançamentos automáticos:** o extrato separa `total_recebido_avulso` do total geral e identifica a origem de cada lançamento.
