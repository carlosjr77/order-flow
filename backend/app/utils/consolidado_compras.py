"""Planejamento de compras: produtos agrupados por termo e consolidado de saídas por período.

- Busca agrupada: "laranja, limão" devolve um grupo por termo com todas as variações
  (unidades KG, SC, CX, UN...) e o preço de cada produto em cada tabela de preço ativa.
- Consolidado: soma o que saiu nos pedidos de um período, por produto, com subtotais por unidade.
  Unidades diferentes nunca são somadas entre si (não há fator de conversão KG x SC x CX).

A data do consolidado segue o Relatório de Vendas: data de entrega e, sem ela, a data do pedido.
"""
import re
import unicodedata
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import Date, cast, distinct, func, or_
from sqlalchemy.orm import Session

from app.models import ItemVenda, Produto, TabelaPreco, TabelaPrecoItem, Venda
from app.utils import busca as busca_texto
from app.utils.unidades import normalizar_unidade

MAX_TERMOS = 10
MIN_CARACTERES_TERMO = 2
MAX_DIAS_PERIODO = 366
MAX_PRODUTOS_BUSCA = 500
SEM_GRUPO = "Outros"


def _dinheiro(valor) -> float:
    return float(Decimal(str(valor or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _quantidade(valor) -> float:
    return float(Decimal(str(valor or 0)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP))


def normalizar(texto: Optional[str]) -> str:
    """Minúsculas, sem acentos e sem espaços repetidos (mesma regra da busca em SQL)."""
    texto = unicodedata.normalize("NFKD", (texto or "").lower()).encode("ascii", "ignore").decode("ascii")
    return " ".join(texto.split())


def separar_termos(termo: Optional[str]) -> list[str]:
    """'laranja, limão; maçã' -> ['laranja', 'limão', 'maçã'], sem repetidos e com limite."""
    if not termo:
        return []
    termos, vistos = [], set()
    for parte in re.split(r"[,;\n]", termo):
        parte = " ".join(parte.split())
        chave = normalizar(parte)
        if len(chave) < MIN_CARACTERES_TERMO or chave in vistos:
            continue
        vistos.add(chave)
        termos.append(parte)
    if len(termos) > MAX_TERMOS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Informe no máximo {MAX_TERMOS} termos por busca.")
    return termos


def _filtro_termos(termos: Iterable[str]):
    condicoes = []
    for termo in termos:
        condicoes.append(busca_texto.contem(Produto.descricao, termo))
        condicoes.append(busca_texto.contem(Produto.codigo_interno, termo))
    return or_(*condicoes)


def _grupos_do_produto(descricao: str, codigo: str, termos: list[str]) -> list[str]:
    """Termos que o produto atende. Sem termos, o grupo é a primeira palavra da descrição."""
    if not termos:
        palavras = (descricao or "").split()
        return [palavras[0].capitalize() if palavras else SEM_GRUPO]
    texto = f"{normalizar(descricao)} {normalizar(codigo)}"
    return [t for t in termos if normalizar(t) in texto]


def _ordem_grupos(grupos: dict, termos: list[str]) -> list[str]:
    if termos:
        return [t for t in termos if t in grupos]
    return sorted(grupos, key=normalizar)


# ---------------------------------------------------------------- busca agrupada

def _precos_por_tabela(db: Session, produtos: list[Produto]) -> dict[int, list[dict]]:
    """Preço de cada produto em cada tabela ativa: exceção do produto, senão margem geral (regra do PDV)."""
    tabelas = db.query(TabelaPreco).filter(TabelaPreco.ativa.is_(True)).order_by(TabelaPreco.nome).all()
    if not tabelas or not produtos:
        return {p.id: [] for p in produtos}
    excecoes = {
        (i.tabela_preco_id, i.produto_id): i
        for i in db.query(TabelaPrecoItem).filter(
            TabelaPrecoItem.produto_id.in_([p.id for p in produtos]),
            TabelaPrecoItem.tabela_preco_id.in_([t.id for t in tabelas]),
        ).all()
    }
    resultado = {}
    for produto in produtos:
        custo = Decimal(str(produto.preco_custo or 0))
        linhas = []
        for tabela in tabelas:
            excecao = excecoes.get((tabela.id, produto.id))
            margem = Decimal(str(excecao.margem_especifica_percentual if excecao else tabela.margem_geral_percentual or 0))
            linhas.append({
                "tabela_preco_id": tabela.id,
                "tabela_nome": tabela.nome,
                "margem_percentual": float(margem),
                "excecao": excecao is not None,
                "preco": _dinheiro(custo * (1 + margem / 100)),
            })
        resultado[produto.id] = linhas
    return resultado


def produtos_agrupados(db: Session, termo: str) -> dict:
    termos = separar_termos(termo)
    if not termos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Informe ao menos um termo com {MIN_CARACTERES_TERMO} letras ou mais.",
        )

    produtos = (
        db.query(Produto)
        .filter(_filtro_termos(termos))
        .order_by(Produto.descricao, Produto.id)
        .limit(MAX_PRODUTOS_BUSCA)
        .all()
    )
    precos = _precos_por_tabela(db, produtos)

    grupos: dict[str, list[dict]] = {}
    for produto in produtos:
        item = {
            "produto_id": produto.id,
            "codigo_interno": produto.codigo_interno,
            "descricao": produto.descricao,
            "unidade_medida": normalizar_unidade(produto.unidade_medida),
            "estoque_atual": _quantidade(produto.estoque_atual),
            "preco_custo": _dinheiro(produto.preco_custo),
            "preco_venda": _dinheiro(produto.preco_venda) if produto.preco_venda is not None else None,
            "margem_lucro": produto.margem_lucro,
            "precos_tabelas": precos.get(produto.id, []),
        }
        for grupo in _grupos_do_produto(produto.descricao, produto.codigo_interno, termos):
            grupos.setdefault(grupo, []).append(item)

    resposta = []
    for nome in _ordem_grupos(grupos, termos):
        itens = grupos[nome]
        unidades: dict[str, dict] = {}
        for item in itens:
            u = unidades.setdefault(item["unidade_medida"], {"unidade": item["unidade_medida"], "produtos": 0, "estoque": 0.0})
            u["produtos"] += 1
            u["estoque"] = _quantidade(Decimal(str(u["estoque"])) + Decimal(str(item["estoque_atual"])))
        resposta.append({"termo": nome, "total_produtos": len(itens), "unidades": list(unidades.values()), "itens": itens})

    return {
        "termos": termos,
        "termos_sem_resultado": [t for t in termos if t not in grupos],
        "grupos": resposta,
        "limite_atingido": len(produtos) >= MAX_PRODUTOS_BUSCA,
    }


# ---------------------------------------------------------------- consolidado por período

def data_referencia():
    """Data de entrega; sem ela, a data do pedido (mesma regra do Relatório de Vendas)."""
    return func.coalesce(Venda.data_entrega, cast(Venda.data_venda, Date))


def validar_periodo(data_inicio: Optional[date], data_fim: Optional[date]) -> int:
    if not data_inicio or not data_fim:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe a data inicial e a data final.")
    if data_inicio > data_fim:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A data inicial não pode ser maior que a data final.")
    dias = (data_fim - data_inicio).days + 1
    if dias > MAX_DIAS_PERIODO:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"O período pode ter no máximo {MAX_DIAS_PERIODO} dias.")
    return dias


def consolidado_produtos(
    db: Session,
    *,
    data_inicio: Optional[date],
    data_fim: Optional[date],
    termo: Optional[str] = None,
    cliente_id: Optional[int] = None,
    tabela_preco_id: Optional[int] = None,
    incluir_canceladas: bool = False,
) -> dict:
    dias = validar_periodo(data_inicio, data_fim)
    termos = separar_termos(termo)
    data_ref = data_referencia()
    custo_item = ItemVenda.quantidade * func.coalesce(ItemVenda.custo_unitario, Produto.preco_custo)

    filtros = [
        Venda.deleted_at.is_(None),
        ItemVenda.deleted_at.is_(None),
        data_ref >= data_inicio,
        data_ref <= data_fim,
    ]
    if not incluir_canceladas:
        filtros.append(Venda.status != "cancelado")
    if cliente_id is not None:
        filtros.append(Venda.cliente_id == cliente_id)
    if tabela_preco_id is not None:
        filtros.append(Venda.tabela_preco_id == tabela_preco_id)
    if termos:
        filtros.append(_filtro_termos(termos))

    def _base(*colunas):
        return (
            db.query(*colunas)
            .select_from(ItemVenda)
            .join(Venda, Venda.id == ItemVenda.venda_id)
            .join(Produto, Produto.id == ItemVenda.produto_id)
            .filter(*filtros)
        )

    linhas = (
        _base(
            Produto.id, Produto.codigo_interno, Produto.descricao, Produto.unidade_medida,
            Produto.estoque_atual, Produto.preco_custo,
            func.sum(ItemVenda.quantidade), func.sum(ItemVenda.valor_total), func.sum(custo_item),
            func.count(distinct(Venda.id)), func.min(data_ref), func.max(data_ref),
        )
        .group_by(Produto.id)
        .order_by(func.sum(ItemVenda.quantidade).desc(), Produto.descricao)
        .all()
    )
    total_pedidos = _base(func.count(distinct(Venda.id))).scalar() or 0

    grupos: dict[str, list[dict]] = {}
    total_faturamento = total_custo = Decimal("0")
    for (pid, codigo, descricao, unidade, estoque, custo_atual, qtd, faturamento, custo, pedidos, primeira, ultima) in linhas:
        qtd, faturamento, custo = Decimal(str(qtd or 0)), Decimal(str(faturamento or 0)), Decimal(str(custo or 0))
        total_faturamento += faturamento
        total_custo += custo
        item = {
            "produto_id": pid,
            "codigo_interno": codigo,
            "descricao": descricao,
            "unidade_medida": normalizar_unidade(unidade),
            "quantidade": _quantidade(qtd),
            "media_diaria": _quantidade(qtd / dias),
            "pedidos": pedidos,
            "faturamento": _dinheiro(faturamento),
            "custo": _dinheiro(custo),
            "lucro": _dinheiro(faturamento - custo),
            "estoque_atual": _quantidade(estoque),
            "preco_custo_atual": _dinheiro(custo_atual),
            "primeira_saida": primeira,
            "ultima_saida": ultima,
        }
        for grupo in _grupos_do_produto(descricao, codigo, termos):
            grupos.setdefault(grupo, []).append(item)

    resposta = []
    for nome in _ordem_grupos(grupos, termos):
        itens = grupos[nome]
        unidades: dict[str, dict] = {}
        for item in itens:
            u = unidades.setdefault(item["unidade_medida"], {
                "unidade": item["unidade_medida"], "quantidade": Decimal("0"),
                "faturamento": Decimal("0"), "custo": Decimal("0"), "produtos": 0,
            })
            u["quantidade"] += Decimal(str(item["quantidade"]))
            u["faturamento"] += Decimal(str(item["faturamento"]))
            u["custo"] += Decimal(str(item["custo"]))
            u["produtos"] += 1
        subtotais = [
            {
                "unidade": u["unidade"],
                "produtos": u["produtos"],
                "quantidade": _quantidade(u["quantidade"]),
                "media_diaria": _quantidade(u["quantidade"] / dias),
                "faturamento": _dinheiro(u["faturamento"]),
                "custo": _dinheiro(u["custo"]),
            }
            for u in sorted(unidades.values(), key=lambda x: x["quantidade"], reverse=True)
        ]
        resposta.append({"termo": nome, "subtotais_por_unidade": subtotais, "itens": itens})

    return {
        "periodo": {"data_inicio": data_inicio, "data_fim": data_fim, "dias": dias, "criterio_data": "entrega_ou_pedido"},
        "termos": termos,
        "termos_sem_resultado": [t for t in termos if t not in grupos],
        "totais": {
            "pedidos": total_pedidos,
            "produtos": len(linhas),
            "faturamento": _dinheiro(total_faturamento),
            "custo": _dinheiro(total_custo),
            "lucro": _dinheiro(total_faturamento - total_custo),
        },
        "grupos": resposta,
    }
