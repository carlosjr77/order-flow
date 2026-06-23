from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from decimal import Decimal
from app.core.database import get_db
from app.routes.auth import get_current_user
from app.models import Venda, ItemVenda, Produto
from app.schemas import VendaCreate, VendaResponse, VendaDetailResponse

router = APIRouter(prefix="/api/vendas", tags=["Vendas"])


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
            **{column.name: getattr(venda, column.name) for column in venda.__table__.columns},
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
    
    # Debug: verificar se existem itens excluidos
    itens_excluidos = db.query(ItemVenda).filter(
        ItemVenda.venda_id == venda_id,
        ItemVenda.deleted_at.isnot(None)
    ).count()
    if itens_excluidos > 0:
        print(f"DEBUG: Venda {venda_id} tem {itens_excluidos} itens excluidos logicamente")
    
    # Debug: verificar total de itens no banco
    total_itens = db.query(ItemVenda).filter(ItemVenda.venda_id == venda_id).count()
    print(f"DEBUG: Venda {venda_id} tem {total_itens} itens no total, {len(itens)} ativos")
    
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
        **{column.name: getattr(venda, column.name) for column in venda.__table__.columns},
        "itens": itens_formatados
    }


@router.post("", response_model=VendaResponse)
def criar_venda(
    venda_data: VendaCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cria uma nova venda com itens"""
    
    if not venda_data.itens:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Venda deve ter pelo menos um item"
        )
    
    # Calcular value total
    valor_total = Decimal("0")
    valor_frete = Decimal(str(venda_data.valor_frete or 0))
    
    # Criar venda
    nova_venda = Venda(
        status="pendente",
        forma_pagamento=venda_data.forma_pagamento,
        observacoes=venda_data.observacoes,
        valor_frete=valor_frete,
        nome_cliente=venda_data.nome_cliente
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
    
    return nova_venda


@router.put("/{venda_id}/concluir")
def concluir_venda(
    venda_id: int,
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
    
    return {"message": "Venda concluída com sucesso", "venda_id": venda.id}


@router.put("/{venda_id}/cancelar")
def cancelar_venda(
    venda_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cancela uma venda e reverte o estoque"""
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
    db.add(venda)
    db.commit()
    
    return {"message": "Venda cancelada e estoque revertido", "venda_id": venda.id}


@router.delete("/{venda_id}")
def excluir_venda(
    venda_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Exclusão lógica de venda - marca como excluída sem remover do banco"""
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
    
    return {"message": "Venda excluída com sucesso (exclusão lógica)", "venda_id": venda.id}
