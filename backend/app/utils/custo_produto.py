"""Atualização do preço de custo de produtos com histórico.

Usado principalmente quando a mercadoria é comprada sem nota fiscal imediata (ex.: CEASA):
o custo é lançado manualmente e cada alteração fica registrada em `produto_custo_historico`.
As funções não fazem commit: quem chama decide o fim da transação.
"""
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Produto, ProdutoCustoHistorico, TabelaPrecoItem, Usuario

ORIGENS_CUSTO = ("manual", "ceasa_sem_nf", "nf")
CUSTO_MAXIMO = Decimal("99999999.99")


def _centavos(valor) -> Decimal:
    return Decimal(str(valor)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def validar_custo(valor) -> Decimal:
    custo = _centavos(valor)
    if custo < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O preço de custo não pode ser negativo.")
    if custo > CUSTO_MAXIMO:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Preço de custo acima do permitido.")
    return custo


def sincronizar_tabelas_preco(db: Session, produto: Produto) -> int:
    """Recalcula o preço guardado nas exceções das tabelas de preço para o custo atual.

    O PDV já calcula o preço a partir do custo atual; este valor guardado só precisa acompanhar.
    """
    itens = db.query(TabelaPrecoItem).filter(TabelaPrecoItem.produto_id == produto.id).all()
    for item in itens:
        margem = Decimal(str(item.margem_especifica_percentual or 0))
        item.preco_calculado = _centavos(Decimal(str(produto.preco_custo)) * (1 + margem / 100))
    return len(itens)


def atualizar_custo(
    db: Session,
    produto: Produto,
    novo_custo,
    *,
    origem: str = "manual",
    observacao: Optional[str] = None,
    usuario: Optional[Usuario] = None,
) -> Optional[ProdutoCustoHistorico]:
    """Troca o custo do produto e registra o histórico. Sem mudança de valor, não registra nada."""
    if origem not in ORIGENS_CUSTO:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Origem do custo inválida.")
    custo = validar_custo(novo_custo)
    anterior = _centavos(produto.preco_custo or 0)
    if custo == anterior:
        return None

    produto.preco_custo = custo
    historico = ProdutoCustoHistorico(
        produto_id=produto.id,
        custo_anterior=anterior,
        custo_novo=custo,
        origem=origem,
        observacao=(observacao or "").strip()[:255] or None,
        usuario_id=usuario.id if usuario else None,
        usuario_nome=(usuario.nome or usuario.username) if usuario else None,
    )
    db.add(historico)
    sincronizar_tabelas_preco(db, produto)
    return historico


def atualizar_custos_em_lote(
    db: Session,
    itens: Sequence[tuple[int, object]],
    *,
    origem: str,
    observacao: Optional[str],
    usuario: Optional[Usuario],
) -> list[tuple[Produto, ProdutoCustoHistorico]]:
    """Atualiza vários custos de uma vez. Se um produto não existir, nada é alterado."""
    ids = [produto_id for produto_id, _ in itens]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Produto repetido na lista.")
    produtos = {p.id: p for p in db.query(Produto).filter(Produto.id.in_(ids)).with_for_update().all()}
    faltando = [str(i) for i in ids if i not in produtos]
    if faltando:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Produto(s) não encontrado(s): {', '.join(faltando)}")

    alterados = []
    for produto_id, custo in itens:
        produto = produtos[produto_id]
        historico = atualizar_custo(db, produto, custo, origem=origem, observacao=observacao, usuario=usuario)
        if historico is not None:
            alterados.append((produto, historico))
    return alterados


def historico_para_dict(h: ProdutoCustoHistorico) -> dict:
    return {
        "id": h.id,
        "produto_id": h.produto_id,
        "custo_anterior": float(h.custo_anterior),
        "custo_novo": float(h.custo_novo),
        "origem": h.origem,
        "observacao": h.observacao,
        "usuario_nome": h.usuario_nome,
        "created_at": h.created_at,
    }
