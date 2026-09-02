# Design: geração e visualização de DANFE fiscal

## Objetivo

Permitir que o frontend envie o XML autorizado de uma NFe ao backend e visualize, imprima ou baixe uma DANFE fiscal gerada por uma biblioteca open-source, sem criar um PDF fiscal artesanal no navegador.

## Escopo

A primeira versão aceita o XML como string no payload JSON. A entidade `Venda` não possui XML fiscal persistido, portanto não haverá lookup por `venda_id` nesta etapa. Vendas sem XML continuam podendo usar o comprovante não fiscal existente, mas não serão apresentadas como DANFE oficial.

## Backend

Será criado um módulo fiscal isolado em `backend/app/utils/danfe.py` para:

- validar XML bem-formado;
- localizar `NFe`/`infNFe` e extrair a chave de acesso;
- rejeitar XML vazio, inválido, sem chave ou que não seja uma NFe;
- chamar `brazilfiscalreport` e renderizar o PDF em `BytesIO`;
- expor erros de domínio sem vazar traceback.

A rota `POST /api/fiscal/danfe/gerar-pdf` exigirá autenticação, receberá `{ "xml": "..." }` e responderá com `StreamingResponse`, `Content-Type: application/pdf` e `Content-Disposition: inline; filename="DANFE-[chave].pdf"`. Falhas de entrada retornam HTTP 422 com mensagem estável para o frontend.

A dependência `brazilfiscalreport` será adicionada ao requirements do backend. Nenhum arquivo temporário será criado.

## Frontend

O cliente HTTP terá um método binário que envia o XML com o token atual e retorna `{ blob, filename }`. Um componente `DanfeViewerDialog` receberá o XML e controlará:

- estado de carregamento enquanto o PDF é solicitado;
- `URL.createObjectURL(blob)` para o iframe;
- impressão pelo `contentWindow.print()`;
- download usando o nome retornado pelo backend;
- fechamento e `URL.revokeObjectURL` para evitar vazamento de memória;
- alerta padrão: `Não foi possível gerar a DANFE: O XML da nota fiscal não foi localizado ou é inválido.`

As telas de PDV e histórico receberão as ações visuais no padrão já utilizado. Como não existe XML associado às vendas, o componente aceitará XML por propriedade/estado; a integração só abrirá a visualização quando esse XML estiver disponível e exibirá o erro definido quando não estiver.

## Testes e validação

- teste unitário do parser para XML inválido, XML não-NFe e chave válida;
- teste da rota para status, content type e content disposition;
- teste/build do cliente TypeScript;
- `npm run lint`, `npm run test` e `npm run build` quando as dependências do projeto estiverem disponíveis.

## Decisões

- `brazilfiscalreport` em vez de microserviço Node para manter a stack atual;
- geração no backend para centralizar layout fiscal e validação;
- payload XML em vez de persistência porque não há coluna/tabela fiscal no modelo atual;
- mensagem de erro única para ausência e invalidez, conforme requisito.
