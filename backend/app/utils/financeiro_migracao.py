"""Prepara dados existentes para o módulo financeiro. Pode rodar várias vezes sem efeito adicional."""
import unicodedata
from datetime import date
from typing import Optional

from sqlalchemy import exists, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models import Cliente, Recebimento, RecebimentoAlocacao, Venda
from app.utils.financeiro import FORMA_NAO_INFORMADA, ORIGEM_MIGRACAO, STATUS_CONCLUIDO

_CHAVE_LOCK = 720261105  # Identifica esta migração em pg_advisory_xact_lock
OBSERVACAO_MIGRACAO = "Baixa anterior ao módulo financeiro"


def normalizar_nome(nome: Optional[str]) -> str:
    sem_acento = "".join(
        letra for letra in unicodedata.normalize("NFKD", nome or "") if not unicodedata.combining(letra)
    )
    return " ".join(sem_acento.casefold().split())


def _vincular_clientes(db: Session) -> int:
    """Só vincula quando o nome normalizado corresponde a exatamente um cliente."""
    ids_por_nome: dict[str, list[int]] = {}
    for cliente_id, nome in db.execute(select(Cliente.id, Cliente.nome)).all():
        ids_por_nome.setdefault(normalizar_nome(nome), []).append(cliente_id)

    vinculadas = 0
    vendas = db.query(Venda).filter(Venda.cliente_id.is_(None), Venda.nome_cliente.isnot(None)).all()
    for venda in vendas:
        candidatos = ids_por_nome.get(normalizar_nome(venda.nome_cliente), [])
        if len(candidatos) == 1:
            venda.cliente_id = candidatos[0]
            vinculadas += 1
    db.flush()
    return vinculadas


def _criar_recebimentos_historicos(db: Session) -> int:
    """Registra como pagas as vendas concluídas antes do módulo financeiro.

    Uma venda com qualquer alocação, mesmo estornada, já passou pelo módulo e fica de fora.
    """
    tem_alocacao = exists().where(RecebimentoAlocacao.venda_id == Venda.id)
    vendas = (
        db.query(Venda)
        .filter(
            Venda.status.in_(STATUS_CONCLUIDO),
            Venda.deleted_at.is_(None),
            Venda.valor_total > 0,
            ~tem_alocacao,
        )
        .all()
    )
    for venda in vendas:
        recebimento = Recebimento(
            cliente_id=venda.cliente_id,
            data_pagamento=venda.data_venda.date() if venda.data_venda else date.today(),
            forma_pagamento=(venda.forma_pagamento or FORMA_NAO_INFORMADA)[:50],
            valor_total=venda.valor_total,
            origem=ORIGEM_MIGRACAO,
            observacoes=OBSERVACAO_MIGRACAO,
            usuario_id=venda.usuario_id,
        )
        recebimento.alocacoes.append(RecebimentoAlocacao(venda_id=venda.id, valor=venda.valor_total))
        db.add(recebimento)
    db.flush()
    return len(vendas)


def migrar_dados_financeiros(engine: Engine) -> dict:
    """Roda tudo em uma transação: em caso de erro, nada é gravado."""
    with Session(bind=engine) as db, db.begin():
        db.execute(select(func.pg_advisory_xact_lock(_CHAVE_LOCK)))
        vinculadas = _vincular_clientes(db)
        recebimentos = _criar_recebimentos_historicos(db)
    return {"vendas_vinculadas": vinculadas, "recebimentos_criados": recebimentos}
