from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
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
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Lista todas as vendas"""
    query = db.query(Venda)
    
    if status_filter:
        query = query.filter(Venda.status == status_filter)
    
    vendas = query.offset(skip).limit(limit).all()
    
    resultado = []
    for venda in vendas:
        itens = db.query(ItemVenda).filter(ItemVenda.venda_id == venda.id).all()
        resultado.append({
            **{column.name: getattr(venda, column.name) for column in venda.__table__.columns},
            "itens": itens
        })
    
    return resultado


@router.get("/{venda_id}", response_model=VendaDetailResponse)
def obter_venda(
    venda_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Obtém uma venda específica"""
    venda = db.query(Venda).filter(Venda.id == venda_id).first()
    
    if not venda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada"
        )
    
    itens = db.query(ItemVenda).filter(ItemVenda.venda_id == venda_id).all()
    
    return {
        **{column.name: getattr(venda, column.name) for column in venda.__table__.columns},
        "itens": itens
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
    
    # Calcular valor total
    valor_total = Decimal("0")
    
    # Criar venda
    nova_venda = Venda(
        status="pendente",
        forma_pagamento=venda_data.forma_pagamento,
        observacoes=venda_data.observacoes
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
        
        if produto.estoque_atual < item.quantidade:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Estoque insuficiente para {produto.descricao}. Disponível: {produto.estoque_atual}"
            )
        
        # Reduzir estoque
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
    
    # Atualizar valor total da venda
    nova_venda.valor_total = valor_total
    
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
    venda = db.query(Venda).filter(Venda.id == venda_id).first()
    
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
    venda = db.query(Venda).filter(Venda.id == venda_id).first()
    
    if not venda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada"
        )
    
    # Reverter estoque
    itens = db.query(ItemVenda).filter(ItemVenda.venda_id == venda_id).all()
    
    for item in itens:
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        if produto:
            produto.estoque_atual += item.quantidade
            db.add(produto)
    
    venda.status = "cancelado"
    db.add(venda)
    db.commit()
    
    return {"message": "Venda cancelada e estoque revertido", "venda_id": venda.id}
