from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel
from app.core.database import get_db
from app.routes.auth import get_current_user
from app.models import Venda, ItemVenda, Produto, Usuario
from app.schemas import VendaCreate, VendaResponse, VendaDetailResponse
from app.utils.audit import registrar_auditoria, get_client_ip

router = APIRouter(prefix="/api/vendas", tags=["Vendas"])


def check_operador_restrito(current_user: dict):
    """Verifica se o usuário é operador e nega operações restritas"""
    if current_user.get("perfil") == "operador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operadores não têm permissão para executar esta ação"
        )


def get_usuario_logado(db: Session, current_user: dict) -> Usuario:
    """Obtém o objeto Usuario completo a partir do token"""
    return db.query(Usuario).filter(Usuario.id == current_user.get("user_id")).first()


def venda_to_dict(venda: Venda, db: Session) -> dict:
    """Converte uma venda em dicionário incluindo nome do usuário"""
    data = {column.name: getattr(venda, column.name) for column in venda.__table__.columns}
    
    # Buscar nome do usuário que registrou a venda
    if venda.usuario_id:
        usuario = db.query(Usuario).filter(Usuario.id == venda.usuario_id).first()
        data["usuario_nome"] = usuario.nome or usuario.username if usuario else None
    else:
        data["usuario_nome"] = None
    
    return data


@router.get("", response_model=List[VendaDetailResponse])
def listar_vendas(
    skip: int = 0,
    limit: int = 100,
    status_filter: str = None,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Lista todas as vendas (opcionalmente inclui excluídas)"""
    query = db.query(Venda)
    
    # Filtrar vendas não excluídas (a menos que include_deleted=True)
    if not include_deleted:
        query = query.filter(Venda.deleted_at.is_(None))
    
    if status_filter:
        query = query.filter(Venda.status == status_filter)
    
    vendas = query.offset(skip).limit(limit).all()
    
    resultado = []
    for venda in vendas:
        # Buscar apenas itens não excluídos
        itens = db.query(ItemVenda).filter(
            ItemVenda.venda_id == venda.id,
            ItemVenda.deleted_at.is_(None)
        ).all()
        resultado.append({
            **venda_to_dict(venda, db),
            "itens": itens
        })
    
    return resultado


@router.get("/{venda_id}", response_model=VendaDetailResponse)
def obter_venda(
    venda_id: int,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Obtém uma venda específica com dados completos dos produtos"""
    query = db.query(Venda).filter(Venda.id == venda_id)
    
    if not include_deleted:
        query = query.filter(Venda.deleted_at.is_(None))
    
    venda = query.first()
    
    if not venda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada"
        )
    
    # Buscar itens com dados do produto
    query_itens = db.query(ItemVenda, Produto).join(
        Produto, ItemVenda.produto_id == Produto.id
    ).filter(ItemVenda.venda_id == venda_id)
    
    if not include_deleted:
        query_itens = query_itens.filter(ItemVenda.deleted_at.is_(None))
    
    itens = query_itens.all()
    
    # Formatando itens com dados do produto
    itens_formatados = []
    for item, produto in itens:
        item_dict = {column.name: getattr(item, column.name) for column in item.__table__.columns}
        item_dict['codigo_interno'] = produto.codigo_interno
        item_dict['descricao'] = produto.descricao
        item_dict['unidade_medida'] = produto.unidade_medida
        item_dict['ncm'] = produto.ncm
        item_dict['preco_custo'] = float(produto.preco_custo) if produto.preco_custo else 0
        itens_formatados.append(item_dict)
    
    return {
        **venda_to_dict(venda, db),
        "itens": itens_formatados
    }


@router.post("", response_model=VendaResponse)
def criar_venda(
    venda_data: VendaCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cria uma nova venda com itens"""
    
    if not venda_data.itens:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Venda deve ter pelo menos um item"
        )
    
    usuario = get_usuario_logado(db, current_user)
    
    # Calcular value total
    valor_total = Decimal("0")
    valor_frete = Decimal(str(venda_data.valor_frete or 0))
    
    # Criar venda
    nova_venda = Venda(
        usuario_id=usuario.id if usuario else None,
        status="pendente",
        forma_pagamento=venda_data.forma_pagamento,
        observacoes=venda_data.observacoes,
        valor_frete=valor_frete,
        nome_cliente=venda_data.nome_cliente,
        data_entrega=venda_data.data_entrega if venda_data.data_entrega else None,
        data_vencimento=venda_data.data_vencimento if venda_data.data_vencimento else None
    )
    
    db.add(nova_venda)
    db.flush()  # Para obter o ID da venda
    
    # Processar itens e reduzir estoque
    for item in venda_data.itens:
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Produto {item.produto_id} não encontrado"
            )
        
        # Verificar estoque apenas se produto nao permitir venda sem estoque
        if produto.estoque_atual < item.quantidade and not produto.vender_sem_estoque:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Estoque insuficiente para {produto.descricao}. Disponível: {produto.estoque_atual}"
            )
        
        # Reduzir estoque (apenas se tiver estoque e nao estiver vendendo sem estoque)
        if produto.estoque_atual >= item.quantidade:
            produto.estoque_atual -= Decimal(str(item.quantidade))
        
        # Criar item de venda
        valor_total_item = Decimal(str(item.quantidade)) * Decimal(str(item.valor_unitario))
        
        item_venda = ItemVenda(
            venda_id=nova_venda.id,
            produto_id=item.produto_id,
            quantidade=Decimal(str(item.quantidade)),
            valor_unitario=Decimal(str(item.valor_unitario)),
            valor_total=valor_total_item
        )
        
        db.add(item_venda)
        valor_total += valor_total_item
    
    # Atualizar value total da venda (incluindo frete)
    nova_venda.valor_total = valor_total + valor_frete
    
    db.commit()
    db.refresh(nova_venda)
    
    # Registrar auditoria
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="criar",
        entidade="venda",
        entidade_id=nova_venda.id,
        descricao=f"Venda #{nova_venda.id} criada por '{usuario_nome}' no valor de R$ {float(nova_venda.valor_total):.2f}",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return nova_venda


@router.put("/{venda_id}/concluir")
def concluir_venda(
    venda_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Conclui uma venda alterando seu status"""
    venda = db.query(Venda).filter(
        Venda.id == venda_id,
        Venda.deleted_at.is_(None)
    ).first()
    
    if not venda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada"
        )
    
    venda.status = "concluído"
    db.add(venda)
    db.commit()
    db.refresh(venda)
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="concluir",
        entidade="venda",
        entidade_id=venda.id,
        descricao=f"Venda #{venda.id} concluída por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Venda concluída com sucesso", "venda_id": venda.id}


class CancelarVendaRequest(BaseModel):
    motivo_cancelamento: Optional[str] = None


@router.put("/{venda_id}/cancelar")
def cancelar_venda(
    venda_id: int,
    request: Request,
    dados: CancelarVendaRequest = CancelarVendaRequest(),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cancela uma venda e reverte o estoque - RESTRITO A ADMIN"""
    # RBAC: apenas admin pode cancelar
    check_operador_restrito(current_user)
    
    venda = db.query(Venda).filter(
        Venda.id == venda_id,
        Venda.deleted_at.is_(None)
    ).first()
    
    if not venda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada"
        )
    
    # Reverter estoque (apenas itens não excluídos)
    itens = db.query(ItemVenda).filter(
        ItemVenda.venda_id == venda_id,
        ItemVenda.deleted_at.is_(None)
    ).all()
    
    for item in itens:
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        if produto:
            produto.estoque_atual += item.quantidade
            db.add(produto)
    
    venda.status = "cancelado"
    venda.motivo_cancelamento = dados.motivo_cancelamento
    db.add(venda)
    db.commit()
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    motivo_texto = f" Motivo: {dados.motivo_cancelamento}" if dados.motivo_cancelamento else ""
    registrar_auditoria(
        db=db,
        acao="cancelar",
        entidade="venda",
        entidade_id=venda.id,
        descricao=f"Venda #{venda.id} cancelada por '{usuario_nome}' e estoque revertido.{motivo_texto}",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Venda cancelada e estoque revertido", "venda_id": venda.id}


class ExcluirVendaRequest(BaseModel):
    motivo_cancelamento: Optional[str] = None


@router.delete("/{venda_id}")
def excluir_venda(
    venda_id: int,
    request: Request,
    dados: ExcluirVendaRequest = ExcluirVendaRequest(),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Exclusão lógica de venda - RESTRITO A ADMIN"""
    # RBAC: apenas admin pode excluir
    check_operador_restrito(current_user)
    
    venda = db.query(Venda).filter(
        Venda.id == venda_id,
        Venda.deleted_at.is_(None)
    ).first()
    
    if not venda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada"
        )
    
    # Marcar venda como excluída
    venda.deleted_at = datetime.now()
    venda.motivo_cancelamento = dados.motivo_cancelamento
    db.add(venda)
    
    # Marcar todos os itens da venda como excluídos
    itens = db.query(ItemVenda).filter(
        ItemVenda.venda_id == venda_id,
        ItemVenda.deleted_at.is_(None)
    ).all()
    
    for item in itens:
        item.deleted_at = datetime.now()
        db.add(item)
    
    db.commit()
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    motivo_texto = f" Motivo: {dados.motivo_cancelamento}" if dados.motivo_cancelamento else ""
    registrar_auditoria(
        db=db,
        acao="excluir",
        entidade="venda",
        entidade_id=venda.id,
        descricao=f"Venda #{venda.id} excluída (exclusão lógica) por '{usuario_nome}'.{motivo_texto}",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Venda excluída com sucesso (exclusão lógica)", "venda_id": venda.id}
