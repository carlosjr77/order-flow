"""Regras do módulo financeiro.

Saldo e status financeiro são sempre calculados a partir das alocações de
recebimentos não estornados. Estas funções não fazem commit: quem chama decide
o fim da transação, e qualquer erro levantado desfaz o que foi feito.
"""
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Optional, Sequence

from fastapi import HTTPException, status as http_status
from sqlalchemy import Date, String, and_, cast, func, literal, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Cliente, NFe, Recebimento, RecebimentoAlocacao, Venda

FORMAS_AVULSO = ("PIX", "Boleto", "Transferência")
ORIGEM_AVULSO = "avulso"
ORIGEM_CONCLUSAO = "conclusao"
ORIGEM_MIGRACAO = "migracao"
ORIGENS_AUTOMATICAS = (ORIGEM_CONCLUSAO, ORIGEM_MIGRACAO)
STATUS_ABERTO = "aberto"
STATUS_PARCIAL = "parcial"
STATUS_LIQUIDADA = "liquidada"
STATUS_CONCLUIDO = ("concluído", "concluido")
FORMA_NAO_INFORMADA = "Não informado"

ZERO = Decimal("0.00")
_BRASILIA = timezone(timedelta(hours=-3))
_ACENTOS = "áàãâäéèêëíìîïóòõôöúùûüçñ"
_SEM_ACENTOS = "aaaaaeeeeiiiiooooouuuucn"


def _erro(status_code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=detail)


def _dados_invalidos(detail: str) -> HTTPException:
    return _erro(http_status.HTTP_400_BAD_REQUEST, detail)


def _conflito(detail: str) -> HTTPException:
    return _erro(http_status.HTTP_409_CONFLICT, detail)


def _nao_encontrado(detail: str) -> HTTPException:
    return _erro(http_status.HTTP_404_NOT_FOUND, detail)


def hoje() -> date:
    """Data atual no fuso de operação do sistema, independente do fuso do servidor."""
    return datetime.now(_BRASILIA).date()


def centavos(valor) -> Decimal:
    return Decimal(str(valor if valor is not None else 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _dinheiro(texto: Decimal) -> str:
    return f"R$ {centavos(texto):.2f}".replace(".", ",")


def status_financeiro(valor_total, valor_pago) -> str:
    total, pago = centavos(valor_total), centavos(valor_pago)
    if total - pago <= 0:
        return STATUS_LIQUIDADA
    return STATUS_PARCIAL if pago > 0 else STATUS_ABERTO


def venda_em_aberto_elegivel(venda: Venda) -> bool:
    return venda.deleted_at is None and venda.status != "cancelado"


def mapa_pagos(db: Session, venda_ids: Sequence[int]) -> dict[int, Decimal]:
    """Valor pago por venda, em uma única consulta. Vendas sem pagamento ficam fora do mapa."""
    if not venda_ids:
        return {}
    linhas = db.execute(
        select(RecebimentoAlocacao.venda_id, func.sum(RecebimentoAlocacao.valor))
        .join(Recebimento, Recebimento.id == RecebimentoAlocacao.recebimento_id)
        .where(Recebimento.estornado_em.is_(None), RecebimentoAlocacao.venda_id.in_(list(venda_ids)))
        .group_by(RecebimentoAlocacao.venda_id)
    ).all()
    return {venda_id: centavos(total) for venda_id, total in linhas}


def _pago_por_origem(db: Session, venda_id: int) -> dict[str, Decimal]:
    linhas = db.execute(
        select(Recebimento.origem, func.sum(RecebimentoAlocacao.valor))
        .join(RecebimentoAlocacao, Recebimento.id == RecebimentoAlocacao.recebimento_id)
        .where(Recebimento.estornado_em.is_(None), RecebimentoAlocacao.venda_id == venda_id)
        .group_by(Recebimento.origem)
    ).all()
    return {origem: centavos(total) for origem, total in linhas}


def _travar_vendas(db: Session, venda_ids: Iterable[int]) -> dict[int, Venda]:
    ids = sorted(set(venda_ids))
    if not ids:
        return {}
    vendas = (
        db.query(Venda)
        .filter(Venda.id.in_(ids))
        .order_by(Venda.id)
        .populate_existing()
        .with_for_update()
        .all()
    )
    return {venda.id: venda for venda in vendas}


def _travar_recebimento(db: Session, recebimento_id: int) -> Recebimento:
    recebimento = (
        db.query(Recebimento)
        .filter(Recebimento.id == recebimento_id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if not recebimento:
        raise _nao_encontrado("Recebimento não encontrado")
    return recebimento


def _alocado_no_recebimento(db: Session, recebimento_id: int) -> Decimal:
    total = db.execute(
        select(func.coalesce(func.sum(RecebimentoAlocacao.valor), 0))
        .where(RecebimentoAlocacao.recebimento_id == recebimento_id)
    ).scalar_one()
    return centavos(total)


def sincronizar_status(db: Session, venda: Venda) -> None:
    """Mantém `concluído` e `pendente` coerentes com o saldo da venda."""
    if venda.status not in ("pendente", *STATUS_CONCLUIDO):
        return
    total = centavos(venda.valor_total)
    pago = _pago_total(db, venda.id)
    if total == 0 and pago == 0:
        return  # Venda sem valor: não há o que quitar, mantém o status operacional.
    venda.status = "concluído" if total - pago <= 0 else "pendente"


def _pago_total(db: Session, venda_id: int) -> Decimal:
    return mapa_pagos(db, [venda_id]).get(venda_id, ZERO)


def _aplicar_alocacoes(db: Session, recebimento: Recebimento, alocacoes: Sequence[tuple[int, Decimal]]) -> None:
    if recebimento.estornado_em is not None:
        raise _conflito("Este recebimento foi estornado e não aceita novas alocações.")

    valores = [centavos(valor) for _, valor in alocacoes]
    if any(valor <= 0 for valor in valores):
        raise _dados_invalidos("O valor alocado em cada nota deve ser maior que zero.")

    disponivel = centavos(recebimento.valor_total) - _alocado_no_recebimento(db, recebimento.id)
    if sum(valores, ZERO) > disponivel:
        raise _dados_invalidos(
            f"As alocações somam mais que o valor disponível no recebimento ({_dinheiro(disponivel)})."
        )

    vendas = _travar_vendas(db, [venda_id for venda_id, _ in alocacoes])
    pagos = mapa_pagos(db, list(vendas))
    acumulado: dict[int, Decimal] = {}

    for (venda_id, _), valor in zip(alocacoes, valores):
        venda = vendas.get(venda_id)
        if venda is None:
            raise _nao_encontrado(f"Venda #{venda_id} não encontrada")
        if not venda_em_aberto_elegivel(venda):
            raise _conflito(f"A venda #{venda_id} está cancelada ou excluída e não pode receber pagamentos.")
        if venda.cliente_id != recebimento.cliente_id:
            raise _conflito(f"A venda #{venda_id} não pertence ao cliente deste recebimento.")

        acumulado[venda_id] = acumulado.get(venda_id, ZERO) + valor
        saldo = centavos(venda.valor_total) - pagos.get(venda_id, ZERO)
        if acumulado[venda_id] > saldo:
            raise _conflito(
                f"O valor alocado na venda #{venda_id} ultrapassa o saldo atual de {_dinheiro(saldo)}. "
                "Atualize a tela e tente novamente."
            )
        db.add(RecebimentoAlocacao(recebimento_id=recebimento.id, venda_id=venda_id, valor=valor))

    db.flush()
    for venda in vendas.values():
        sincronizar_status(db, venda)
    db.flush()


def registrar_recebimento(
    db: Session,
    *,
    cliente_id: int,
    data_pagamento: date,
    forma_pagamento: str,
    valor_total: Decimal,
    alocacoes: Sequence[tuple[int, Decimal]] = (),
    observacoes: Optional[str] = None,
    usuario_id: Optional[int] = None,
) -> Recebimento:
    """Registra um recebimento avulso. O que não for alocado fica como crédito do cliente."""
    if forma_pagamento not in FORMAS_AVULSO:
        raise _dados_invalidos(f"Forma de pagamento inválida. Use: {', '.join(FORMAS_AVULSO)}.")
    if data_pagamento > hoje():
        raise _dados_invalidos("A data do pagamento não pode ser futura.")
    if centavos(valor_total) <= 0:
        raise _dados_invalidos("O valor recebido deve ser maior que zero.")
    if db.get(Cliente, cliente_id) is None:
        raise _nao_encontrado("Cliente não encontrado")

    recebimento = Recebimento(
        cliente_id=cliente_id,
        data_pagamento=data_pagamento,
        forma_pagamento=forma_pagamento,
        valor_total=centavos(valor_total),
        origem=ORIGEM_AVULSO,
        observacoes=observacoes,
        usuario_id=usuario_id,
    )
    db.add(recebimento)
    db.flush()
    _aplicar_alocacoes(db, recebimento, alocacoes)
    return recebimento


def alocar(db: Session, recebimento_id: int, alocacoes: Sequence[tuple[int, Decimal]]) -> Recebimento:
    """Usa o valor ainda disponível de um recebimento em uma ou mais notas."""
    if not alocacoes:
        raise _dados_invalidos("Informe ao menos uma nota para alocar.")
    recebimento = _travar_recebimento(db, recebimento_id)
    _aplicar_alocacoes(db, recebimento, alocacoes)
    return recebimento


def _marcar_estorno(recebimento: Recebimento, motivo: str, usuario_id: Optional[int]) -> None:
    recebimento.estornado_em = datetime.now()
    recebimento.estornado_por_id = usuario_id
    recebimento.motivo_estorno = motivo


def estornar(db: Session, recebimento_id: int, motivo: str, usuario_id: Optional[int]) -> Recebimento:
    """Estorna um recebimento inteiro e reabre as notas que ele quitava."""
    if not (motivo or "").strip():
        raise _dados_invalidos("Informe o motivo do estorno.")
    recebimento = _travar_recebimento(db, recebimento_id)
    if recebimento.estornado_em is not None:
        raise _conflito("Este recebimento já foi estornado.")

    _marcar_estorno(recebimento, motivo.strip(), usuario_id)
    db.flush()
    vendas = _travar_vendas(db, [alocacao.venda_id for alocacao in recebimento.alocacoes])
    for venda in vendas.values():
        sincronizar_status(db, venda)
    db.flush()
    return recebimento


def _recebimentos_automaticos_ativos(db: Session, venda_id: int) -> list[Recebimento]:
    return (
        db.query(Recebimento)
        .join(RecebimentoAlocacao, RecebimentoAlocacao.recebimento_id == Recebimento.id)
        .filter(
            RecebimentoAlocacao.venda_id == venda_id,
            Recebimento.estornado_em.is_(None),
            Recebimento.origem.in_(ORIGENS_AUTOMATICAS),
        )
        .distinct()
        .all()
    )


def _estornar_automaticos(db: Session, venda: Venda, motivo: str, usuario_id: Optional[int]) -> None:
    for recebimento in _recebimentos_automaticos_ativos(db, venda.id):
        _marcar_estorno(recebimento, motivo, usuario_id)
    db.flush()


def _criar_recebimento_conclusao(db: Session, venda: Venda, valor: Decimal, usuario_id: Optional[int]) -> Recebimento:
    recebimento = Recebimento(
        cliente_id=venda.cliente_id,
        data_pagamento=hoje(),
        forma_pagamento=(venda.forma_pagamento or FORMA_NAO_INFORMADA)[:50],
        valor_total=valor,
        origem=ORIGEM_CONCLUSAO,
        observacoes=f"Baixa total da venda #{venda.id}",
        usuario_id=usuario_id,
    )
    db.add(recebimento)
    db.flush()
    db.add(RecebimentoAlocacao(recebimento_id=recebimento.id, venda_id=venda.id, valor=valor))
    db.flush()
    return recebimento


def _quitar_saldo(db: Session, venda: Venda, usuario_id: Optional[int]) -> None:
    saldo = centavos(venda.valor_total) - _pago_total(db, venda.id)
    if saldo > 0:
        _criar_recebimento_conclusao(db, venda, saldo, usuario_id)
    venda.status = "concluído"
    db.flush()


def concluir_venda(db: Session, venda: Venda, usuario_id: Optional[int]) -> None:
    """Baixa total: o saldo restante vira um recebimento de origem `conclusao`."""
    if venda.status == "cancelado":
        raise _conflito("Venda cancelada não pode ser concluída.")
    _quitar_saldo(db, venda, usuario_id)


def preparar_cancelamento(db: Session, venda: Venda, usuario_id: Optional[int]) -> None:
    """Deve ser chamada antes de cancelar ou excluir uma venda."""
    if _pago_por_origem(db, venda.id).get(ORIGEM_AVULSO, ZERO) > 0:
        raise _conflito(
            f"A venda #{venda.id} tem recebimento avulso alocado. "
            "Estorne o recebimento no módulo Financeiro antes de continuar."
        )
    _estornar_automaticos(db, venda, f"Venda #{venda.id} cancelada ou excluída", usuario_id)


def aplicar_edicao(
    db: Session,
    venda: Venda,
    total_anterior,
    status_solicitado: Optional[str],
    usuario_id: Optional[int],
) -> None:
    """Ajusta recebimentos e status depois que o total da venda foi alterado.

    `venda.valor_total` já deve conter o novo total, ainda sem commit.
    """
    novo_total = centavos(venda.valor_total)
    por_origem = _pago_por_origem(db, venda.id)
    avulso = por_origem.get(ORIGEM_AVULSO, ZERO)

    if novo_total < avulso:
        raise _conflito(
            f"O novo total ({_dinheiro(novo_total)}) é menor que o valor já recebido em "
            f"recebimentos avulsos ({_dinheiro(avulso)}). Estorne o recebimento antes de editar."
        )

    if status_solicitado == "cancelado":
        preparar_cancelamento(db, venda, usuario_id)
        venda.status = "cancelado"
        return

    if status_solicitado == "pendente":
        _estornar_automaticos(db, venda, f"Venda #{venda.id} reaberta na edição", usuario_id)
        sincronizar_status(db, venda)
        return

    automatico = sum((por_origem.get(origem, ZERO) for origem in ORIGENS_AUTOMATICAS), ZERO)
    quitada_automaticamente = venda.status in STATUS_CONCLUIDO and automatico > 0
    pediu_conclusao = status_solicitado in STATUS_CONCLUIDO

    if quitada_automaticamente or pediu_conclusao:
        if novo_total != centavos(total_anterior) and automatico > 0:
            _estornar_automaticos(db, venda, f"Total da venda #{venda.id} alterado na edição", usuario_id)
        _quitar_saldo(db, venda, usuario_id)
        return

    sincronizar_status(db, venda)
    db.flush()


def vincular_cliente(db: Session, venda: Venda, cliente_id: Optional[int]) -> None:
    """Liga a venda a um cliente e leva o vínculo para os recebimentos automáticos dela."""
    if cliente_id is not None and db.get(Cliente, cliente_id) is None:
        raise _nao_encontrado("Cliente não encontrado")
    if venda.cliente_id == cliente_id:
        return
    if _pago_por_origem(db, venda.id).get(ORIGEM_AVULSO, ZERO) > 0:
        raise _conflito(
            f"A venda #{venda.id} tem recebimento avulso de outro cliente. "
            "Estorne o recebimento antes de trocar o cliente."
        )
    venda.cliente_id = cliente_id
    for recebimento in _recebimentos_automaticos_ativos(db, venda.id):
        recebimento.cliente_id = cliente_id
    db.flush()


def normalizar_nome(nome: Optional[str]) -> str:
    """Forma de comparação de nomes: sem acentos, sem diferença de caixa e com espaços colapsados."""
    sem_acento = "".join(
        letra for letra in unicodedata.normalize("NFKD", nome or "") if not unicodedata.combining(letra)
    )
    return " ".join(sem_acento.casefold().split())


def clientes_com_nome(db: Session, nome: Optional[str]) -> list[int]:
    """Ids dos clientes cujo nome normalizado é igual ao informado."""
    alvo = normalizar_nome(nome)
    return [
        cliente_id
        for cliente_id, nome_cliente in db.execute(select(Cliente.id, Cliente.nome).order_by(Cliente.id)).all()
        if normalizar_nome(nome_cliente) == alvo
    ]


def obter_ou_criar_cliente(db: Session, nome: Optional[str]) -> tuple[Optional[Cliente], bool]:
    """Devolve o cliente do nome e se ele foi criado agora.

    Retorna (None, False) para nome vazio ou quando há mais de um cadastro com o nome,
    pois escolher um deles poderia lançar a dívida na conta da pessoa errada.
    """
    alvo = normalizar_nome(nome)
    if not alvo:
        return None, False

    # Impede que duas vendas simultâneas criem o mesmo cliente duas vezes.
    db.execute(select(func.pg_advisory_xact_lock(func.hashtext(alvo))))
    candidatos = clientes_com_nome(db, nome)
    if len(candidatos) > 1:
        return None, False
    if candidatos:
        return db.get(Cliente, candidatos[0]), False

    cliente = Cliente(nome=" ".join(nome.split()))
    db.add(cliente)
    db.flush()
    return cliente, True


def garantir_cliente(db: Session, venda: Venda) -> Optional[Cliente]:
    """Liga ao cadastro a venda que só tem o nome do cliente. Devolve o cliente, se foi criado agora."""
    if venda.cliente_id is not None or venda.status == "cancelado":
        return None
    cliente, criado = obter_ou_criar_cliente(db, venda.nome_cliente)
    if cliente is not None:
        vincular_cliente(db, venda, cliente.id)
    return cliente if criado else None


def descricao_titulo(venda_id: int, numero_nfe: Optional[int]) -> str:
    return f"NF-e nº {numero_nfe}" if numero_nfe else f"Pedido #{venda_id}"


def _pagos_subquery():
    return (
        select(
            RecebimentoAlocacao.venda_id.label("venda_id"),
            func.sum(RecebimentoAlocacao.valor).label("pago"),
        )
        .join(Recebimento, Recebimento.id == RecebimentoAlocacao.recebimento_id)
        .where(Recebimento.estornado_em.is_(None))
        .group_by(RecebimentoAlocacao.venda_id)
        .subquery()
    )


def _sem_acento(coluna):
    return func.translate(func.lower(coluna), _ACENTOS, _SEM_ACENTOS)


def _padrao_like(termo: str) -> str:
    escapado = termo.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escapado}%"


def _filtro_busca(busca: str):
    padrao = _sem_acento(literal(_padrao_like(busca.strip()), String))
    condicoes = [
        _sem_acento(Cliente.nome).like(padrao, escape="\\"),
        _sem_acento(Venda.nome_cliente).like(padrao, escape="\\"),
    ]
    digitos = re.sub(r"\D", "", busca)
    if digitos:
        documento = func.regexp_replace(Cliente.documento, r"\D", "", "g")
        condicoes.append(documento.like(f"%{digitos}%"))
    return or_(*condicoes)


def _condicoes_filtro(
    pagos,
    *,
    busca: Optional[str] = None,
    cliente_id: Optional[int] = None,
    status: Optional[str] = None,
    tipo_data: str = "emissao",
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
) -> list:
    """Condições usadas nas telas Financeiro e Vendas. Exigem join com Cliente e com `pagos`."""
    if data_inicio and data_fim and data_inicio > data_fim:
        raise _dados_invalidos("A data inicial não pode ser maior que a data final.")

    pago = func.coalesce(pagos.c.pago, 0)
    saldo = Venda.valor_total - pago
    coluna_data = Venda.data_vencimento if tipo_data == "vencimento" else cast(Venda.data_venda, Date)

    filtros = []
    if busca and busca.strip():
        filtros.append(_filtro_busca(busca))
    if cliente_id is not None:
        filtros.append(Venda.cliente_id == cliente_id)
    if status == STATUS_ABERTO:
        filtros.append(and_(pago == 0, saldo > 0))
    elif status == STATUS_PARCIAL:
        filtros.append(and_(pago > 0, saldo > 0))
    elif status == STATUS_LIQUIDADA:
        filtros.append(saldo <= 0)
    if data_inicio:
        filtros.append(coluna_data >= data_inicio)
    if data_fim:
        filtros.append(coluna_data <= data_fim)
    return filtros


def filtrar_vendas(query, **filtros):
    """Aplica os filtros da tela de Vendas a uma consulta de `Venda`."""
    pagos = _pagos_subquery()
    condicoes = _condicoes_filtro(pagos, **filtros)
    if filtros.get("status"):
        condicoes.append(Venda.status != "cancelado")
    if not condicoes:
        return query
    return (
        query.outerjoin(Cliente, Cliente.id == Venda.cliente_id)
        .outerjoin(pagos, pagos.c.venda_id == Venda.id)
        .filter(*condicoes)
    )


def buscar_titulos(
    db: Session,
    *,
    busca: Optional[str] = None,
    cliente_id: Optional[int] = None,
    status: Optional[str] = None,
    tipo_data: str = "emissao",
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    pagina: int = 1,
    limite: int = 50,
) -> dict:
    """Busca paginada de títulos. O status é filtrado em SQL para os totais ficarem corretos."""
    pagos = _pagos_subquery()
    pago = func.coalesce(pagos.c.pago, 0)
    saldo = Venda.valor_total - pago

    filtros = [
        Venda.deleted_at.is_(None),
        Venda.status != "cancelado",
        *_condicoes_filtro(
            pagos,
            busca=busca,
            cliente_id=cliente_id,
            status=status,
            tipo_data=tipo_data,
            data_inicio=data_inicio,
            data_fim=data_fim,
        ),
    ]

    def _com_joins(consulta):
        return (
            consulta.select_from(Venda)
            .outerjoin(Cliente, Cliente.id == Venda.cliente_id)
            .outerjoin(pagos, pagos.c.venda_id == Venda.id)
            .where(*filtros)
        )

    total_linhas, soma_original, soma_pago, soma_saldo = db.execute(_com_joins(select(
        func.count(Venda.id),
        func.coalesce(func.sum(Venda.valor_total), 0),
        func.coalesce(func.sum(pago), 0),
        func.coalesce(func.sum(saldo), 0),
    ))).one()

    linhas = db.execute(
        _com_joins(select(Venda, Cliente, pago.label("pago"), NFe.numero))
        .outerjoin(NFe, and_(NFe.venda_id == Venda.id, NFe.status == "autorizada"))
        .order_by(Venda.data_vencimento.asc().nulls_last(), Venda.id.desc())
        .offset((pagina - 1) * limite)
        .limit(limite)
    ).all()

    itens = [
        {
            "venda_id": venda.id,
            "numero_nfe": numero_nfe,
            "descricao": descricao_titulo(venda.id, numero_nfe),
            "cliente_id": venda.cliente_id,
            "cliente_nome": cliente.nome if cliente else venda.nome_cliente,
            "cliente_documento": cliente.documento if cliente else None,
            "data_emissao": venda.data_venda.date() if venda.data_venda else None,
            "data_vencimento": venda.data_vencimento,
            "valor_original": centavos(venda.valor_total),
            "valor_pago": centavos(valor_pago),
            "saldo": centavos(venda.valor_total) - centavos(valor_pago),
            "status_financeiro": status_financeiro(venda.valor_total, valor_pago),
        }
        for venda, cliente, valor_pago, numero_nfe in linhas
    ]

    return {
        "itens": itens,
        "total": total_linhas,
        "pagina": pagina,
        "limite": limite,
        "totais": {
            "valor_original": centavos(soma_original),
            "valor_pago": centavos(soma_pago),
            "saldo": centavos(soma_saldo),
        },
    }


def recebimento_para_dict(recebimento: Recebimento) -> dict:
    valor = centavos(recebimento.valor_total)
    alocado = sum((centavos(a.valor) for a in recebimento.alocacoes), ZERO)
    return {
        "id": recebimento.id,
        "cliente_id": recebimento.cliente_id,
        "data_pagamento": recebimento.data_pagamento,
        "forma_pagamento": recebimento.forma_pagamento,
        "valor_total": valor,
        "origem": recebimento.origem,
        "observacoes": recebimento.observacoes,
        "valor_disponivel": valor - alocado if recebimento.estornado_em is None else ZERO,
        "alocacoes": [{"venda_id": a.venda_id, "valor": centavos(a.valor)} for a in recebimento.alocacoes],
        "estornado_em": recebimento.estornado_em,
        "motivo_estorno": recebimento.motivo_estorno,
    }


def extrato_cliente(db: Session, cliente_id: int) -> dict:
    """Extrato calculado no momento da chamada."""
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        raise _nao_encontrado("Cliente não encontrado")

    vendas = db.execute(
        select(Venda, NFe.numero)
        .outerjoin(NFe, and_(NFe.venda_id == Venda.id, NFe.status == "autorizada"))
        .where(Venda.cliente_id == cliente_id, Venda.deleted_at.is_(None), Venda.status != "cancelado")
        .order_by(Venda.data_venda, Venda.id)
    ).all()
    pagos = mapa_pagos(db, [venda.id for venda, _ in vendas])

    titulos = []
    for venda, numero_nfe in vendas:
        total, pago = centavos(venda.valor_total), pagos.get(venda.id, ZERO)
        titulos.append({
            "venda_id": venda.id,
            "numero_nfe": numero_nfe,
            "descricao": descricao_titulo(venda.id, numero_nfe),
            "data_emissao": venda.data_venda.date() if venda.data_venda else None,
            "data_vencimento": venda.data_vencimento,
            "valor_original": total,
            "valor_pago": pago,
            "saldo": total - pago,
            "status_financeiro": status_financeiro(total, pago),
        })

    recebimentos_orm = (
        db.query(Recebimento)
        .options(selectinload(Recebimento.alocacoes))
        .filter(Recebimento.cliente_id == cliente_id)
        .order_by(Recebimento.data_pagamento.desc(), Recebimento.id.desc())
        .all()
    )

    recebimentos = [recebimento_para_dict(recebimento) for recebimento in recebimentos_orm]
    ativos = [r for r in recebimentos if r["estornado_em"] is None]
    total_recebido = sum((r["valor_total"] for r in ativos), ZERO)
    total_avulso = sum((r["valor_total"] for r in ativos if r["origem"] == ORIGEM_AVULSO), ZERO)
    credito = sum((r["valor_disponivel"] for r in ativos), ZERO)

    total_bruto = sum((t["valor_original"] for t in titulos), ZERO)
    total_em_aberto = sum((t["saldo"] for t in titulos), ZERO)

    return {
        "cliente": {
            "id": cliente.id,
            "nome": cliente.nome,
            "documento": cliente.documento,
            "telefone": cliente.telefone,
        },
        "resumo": {
            "total_bruto": total_bruto,
            "total_em_aberto": total_em_aberto,
            "total_recebido": total_recebido,
            "total_recebido_avulso": total_avulso,
            "credito_disponivel": credito,
            "saldo_liquido": total_em_aberto - credito,
        },
        "titulos": titulos,
        "recebimentos": recebimentos,
        "gerado_em": datetime.now(_BRASILIA).replace(tzinfo=None),
    }
