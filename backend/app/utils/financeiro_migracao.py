"""Prepara dados existentes para o módulo financeiro. Pode rodar várias vezes sem efeito adicional."""
from datetime import date

from sqlalchemy import exists, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models import Cliente, Recebimento, RecebimentoAlocacao, Venda
from app.utils.financeiro import (
    FORMA_NAO_INFORMADA,
    ORIGEM_MIGRACAO,
    ORIGENS_AUTOMATICAS,
    STATUS_CONCLUIDO,
    normalizar_nome,
)

_CHAVE_LOCK = 720261105  # Identifica esta migração em pg_advisory_xact_lock
OBSERVACAO_MIGRACAO = "Baixa anterior ao módulo financeiro"


def _ids_por_nome(db: Session) -> dict[str, list[int]]:
    ids: dict[str, list[int]] = {}
    for cliente_id, nome in db.execute(select(Cliente.id, Cliente.nome)).all():
        ids.setdefault(normalizar_nome(nome), []).append(cliente_id)
    return ids


def _criar_clientes_faltantes(db: Session) -> int:
    """Cadastra os nomes de vendas ativas que ainda não existem em `clientes`.

    Variações como "João" e "JOAO" viram um único cliente, com o nome da venda mais antiga.
    """
    existentes = _ids_por_nome(db)
    vendas = (
        db.query(Venda)
        .filter(
            Venda.cliente_id.is_(None),
            Venda.nome_cliente.isnot(None),
            Venda.deleted_at.is_(None),
            Venda.status != "cancelado",
        )
        .order_by(Venda.id)
        .all()
    )
    criados = 0
    for venda in vendas:
        alvo = normalizar_nome(venda.nome_cliente)
        if alvo and alvo not in existentes:
            db.add(Cliente(nome=" ".join(venda.nome_cliente.split())))
            existentes[alvo] = []
            criados += 1
    db.flush()
    return criados


def _vincular_clientes(db: Session) -> int:
    """Só vincula quando o nome normalizado corresponde a exatamente um cliente."""
    ids_por_nome = _ids_por_nome(db)
    vinculadas = 0
    vendas = db.query(Venda).filter(Venda.cliente_id.is_(None), Venda.nome_cliente.isnot(None)).all()
    for venda in vendas:
        candidatos = ids_por_nome.get(normalizar_nome(venda.nome_cliente), [])
        if len(candidatos) == 1:
            venda.cliente_id = candidatos[0]
            vinculadas += 1
    db.flush()
    return vinculadas


def _propagar_cliente_para_recebimentos(db: Session) -> None:
    """Recebimentos automáticos criados antes do vínculo passam a apontar para o cliente da venda."""
    linhas = (
        db.query(Recebimento, Venda.cliente_id)
        .join(RecebimentoAlocacao, RecebimentoAlocacao.recebimento_id == Recebimento.id)
        .join(Venda, Venda.id == RecebimentoAlocacao.venda_id)
        .filter(
            Recebimento.cliente_id.is_(None),
            Recebimento.origem.in_(ORIGENS_AUTOMATICAS),
            Venda.cliente_id.isnot(None),
        )
        .all()
    )
    for recebimento, cliente_id in linhas:
        recebimento.cliente_id = cliente_id
    db.flush()


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
        clientes = _criar_clientes_faltantes(db)
        vinculadas = _vincular_clientes(db)
        _propagar_cliente_para_recebimentos(db)
        recebimentos = _criar_recebimentos_historicos(db)
    return {
        "clientes_criados": clientes,
        "vendas_vinculadas": vinculadas,
        "recebimentos_criados": recebimentos,
    }
