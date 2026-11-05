from datetime import date
from decimal import Decimal
from typing import Annotated, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Recebimento, Usuario, Venda
from app.routes.auth import get_current_user, require_admin
from app.utils import financeiro
from app.utils.audit import get_client_ip, registrar_auditoria

router = APIRouter(prefix="/api/financeiro", tags=["Financeiro"])

Valor = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class AlocacaoEntrada(BaseModel):
    venda_id: int
    valor: Valor


class RecebimentoCriar(BaseModel):
    cliente_id: int
    data_pagamento: date
    forma_pagamento: str
    valor_total: Valor
    observacoes: Optional[str] = Field(default=None, max_length=255)
    alocacoes: List[AlocacaoEntrada] = []


class AlocacoesCriar(BaseModel):
    alocacoes: List[AlocacaoEntrada] = Field(min_length=1)


class EstornoCriar(BaseModel):
    motivo: str = Field(min_length=1, max_length=255)


class VinculoCliente(BaseModel):
    cliente_id: int


def _auditar(db: Session, request: Request, current_user: dict, acao: str, entidade: str, entidade_id: int, descricao: str) -> None:
    usuario = db.query(Usuario).filter(Usuario.id == current_user.get("user_id")).first()
    registrar_auditoria(
        db=db,
        acao=acao,
        entidade=entidade,
        entidade_id=entidade_id,
        descricao=descricao,
        user_id=usuario.id if usuario else None,
        user_name=(usuario.nome or usuario.username) if usuario else "sistema",
        ip_address=get_client_ip(request),
    )


def _tuplas(alocacoes: List[AlocacaoEntrada]) -> list[tuple[int, Decimal]]:
    return [(alocacao.venda_id, alocacao.valor) for alocacao in alocacoes]


def _recebimento_resposta(db: Session, recebimento_id: int) -> dict:
    return financeiro.recebimento_para_dict(db.get(Recebimento, recebimento_id))


@router.get("/titulos")
def listar_titulos(
    busca: Optional[str] = None,
    cliente_id: Optional[int] = None,
    status_titulo: Optional[Literal["aberto", "parcial", "liquidada"]] = Query(default=None, alias="status"),
    tipo_data: Literal["emissao", "vencimento"] = "emissao",
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    pagina: int = Query(default=1, ge=1),
    limite: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Busca títulos de qualquer período por cliente, documento, status e datas"""
    return financeiro.buscar_titulos(
        db,
        busca=busca,
        cliente_id=cliente_id,
        status=status_titulo,
        tipo_data=tipo_data,
        data_inicio=data_inicio,
        data_fim=data_fim,
        pagina=pagina,
        limite=limite,
    )


@router.post("/recebimentos", status_code=status.HTTP_201_CREATED)
def criar_recebimento(
    dados: RecebimentoCriar,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Registra um recebimento avulso. O valor não alocado fica como crédito do cliente"""
    recebimento = financeiro.registrar_recebimento(
        db,
        cliente_id=dados.cliente_id,
        data_pagamento=dados.data_pagamento,
        forma_pagamento=dados.forma_pagamento,
        valor_total=dados.valor_total,
        alocacoes=_tuplas(dados.alocacoes),
        observacoes=dados.observacoes,
        usuario_id=current_user.get("user_id"),
    )
    db.commit()
    _auditar(
        db, request, current_user, "criar", "recebimento", recebimento.id,
        f"Recebimento #{recebimento.id} de R$ {dados.valor_total:.2f} ({dados.forma_pagamento}) "
        f"do cliente #{dados.cliente_id}, alocado em {len(dados.alocacoes)} nota(s)",
    )
    return _recebimento_resposta(db, recebimento.id)


@router.post("/recebimentos/{recebimento_id}/alocacoes")
def alocar_recebimento(
    recebimento_id: int,
    dados: AlocacoesCriar,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Usa o valor disponível de um recebimento em uma ou mais notas"""
    financeiro.alocar(db, recebimento_id, _tuplas(dados.alocacoes))
    db.commit()
    _auditar(
        db, request, current_user, "alocar", "recebimento", recebimento_id,
        f"Recebimento #{recebimento_id}: crédito usado em "
        + ", ".join(f"venda #{a.venda_id} (R$ {a.valor:.2f})" for a in dados.alocacoes),
    )
    return _recebimento_resposta(db, recebimento_id)


@router.post("/recebimentos/{recebimento_id}/estornar")
def estornar_recebimento(
    recebimento_id: int,
    dados: EstornoCriar,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    """Estorna um recebimento e reabre as notas quitadas por ele. Somente administradores"""
    financeiro.estornar(db, recebimento_id, dados.motivo, admin.get("user_id"))
    db.commit()
    _auditar(
        db, request, admin, "estornar", "recebimento", recebimento_id,
        f"Recebimento #{recebimento_id} estornado. Motivo: {dados.motivo.strip()}",
    )
    return _recebimento_resposta(db, recebimento_id)


@router.get("/clientes/{cliente_id}/extrato")
def obter_extrato(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Extrato financeiro do cliente, calculado no momento da requisição"""
    return financeiro.extrato_cliente(db, cliente_id)


@router.get("/vendas-sem-cliente")
def listar_vendas_sem_cliente(
    pagina: int = Query(default=1, ge=1),
    limite: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Vendas sem vínculo com o cadastro. As pendentes vêm primeiro, pois formam saldo devedor"""
    consulta = db.query(Venda).filter(
        Venda.cliente_id.is_(None),
        Venda.deleted_at.is_(None),
        Venda.status != "cancelado",
    )
    total = consulta.count()
    vendas = (
        consulta.order_by((Venda.status == "pendente").desc(), Venda.id.desc())
        .offset((pagina - 1) * limite)
        .limit(limite)
        .all()
    )
    return {
        "itens": [
            {
                "venda_id": venda.id,
                "nome_cliente": venda.nome_cliente,
                "data_emissao": venda.data_venda.date() if venda.data_venda else None,
                "valor_total": financeiro.centavos(venda.valor_total),
                "status": venda.status,
            }
            for venda in vendas
        ],
        "total": total,
        "pagina": pagina,
        "limite": limite,
    }


@router.put("/vendas/{venda_id}/cliente")
def vincular_venda_cliente(
    venda_id: int,
    dados: VinculoCliente,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Vincula uma venda a um cliente do cadastro"""
    venda = (
        db.query(Venda)
        .filter(Venda.id == venda_id, Venda.deleted_at.is_(None))
        .with_for_update()
        .first()
    )
    if not venda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venda não encontrada")

    financeiro.vincular_cliente(db, venda, dados.cliente_id)
    db.commit()
    _auditar(
        db, request, current_user, "vincular", "venda", venda_id,
        f"Venda #{venda_id} vinculada ao cliente #{dados.cliente_id}",
    )
    return {"venda_id": venda_id, "cliente_id": dados.cliente_id}
