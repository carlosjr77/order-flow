from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.routes.auth import get_current_user
from app.models import Produto
from app.schemas import ProdutoCreate, ProdutoResponse, ProdutoUpdate

router = APIRouter(prefix="/api/produtos", tags=["Produtos"])


@router.get("", response_model=List[ProdutoResponse])
def listar_produtos(
    skip: int = 0,
    limit: int = 100,
    busca: str = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Lista todos os produtos com paginação e busca opcional"""
    query = db.query(Produto)
    
    if busca:
        query = query.filter(
            (Produto.codigo_interno.ilike(f"%{busca}%")) |
            (Produto.descricao.ilike(f"%{busca}%"))
        )
    
    return query.offset(skip).limit(limit).all()


@router.get("/{produto_id}", response_model=ProdutoResponse)
def obter_produto(
    produto_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Obtém um produto específico"""
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    return produto


@router.post("", response_model=ProdutoResponse)
def criar_produto(
    produto_data: ProdutoCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cria um novo produto"""
    
    # Verificar se código já existe
    produto_existente = db.query(Produto).filter(
        Produto.codigo_interno == produto_data.codigo_interno
    ).first()
    
    if produto_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código de produto já existe"
        )
    
    novo_produto = Produto(
        codigo_interno=produto_data.codigo_interno,
        descricao=produto_data.descricao,
        preco_custo=produto_data.preco_custo,
        preco_venda=produto_data.preco_venda,
        unidade_medida=produto_data.unidade_medida,
        ncm=produto_data.ncm,
        estoque_atual=produto_data.estoque_inicial or 0,
        vender_sem_estoque=1 if produto_data.vender_sem_estoque else 0
    )
    
    db.add(novo_produto)
    db.commit()
    db.refresh(novo_produto)
    
    return novo_produto


@router.put("/{produto_id}", response_model=ProdutoResponse)
def atualizar_produto(
    produto_id: int,
    produto_data: ProdutoUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Atualiza um produto existente"""
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    update_data = produto_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        # Converter boolean para integer para vender_sem_estoque (0 ou 1)
        if field == "vender_sem_estoque" and isinstance(value, bool):
            value = 1 if value else 0
        setattr(produto, field, value)
    
    db.add(produto)
    db.commit()
    db.refresh(produto)
    
    return produto


@router.delete("/{produto_id}")
def deletar_produto(
    produto_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Deleta um produto"""
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    db.delete(produto)
    db.commit()
    
    return {"message": "Produto deletado com sucesso"}


@router.put("/{produto_id}/estoque/adicionar")
def adicionar_estoque(
    produto_id: int,
    quantidade: float,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Adiciona quantidade ao estoque"""
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    produto.estoque_atual += quantidade
    db.add(produto)
    db.commit()
    db.refresh(produto)
    
    return {
        "message": "Estoque atualizado",
        "produto_id": produto.id,
        "novo_estoque": float(produto.estoque_atual)
    }


@router.put("/{produto_id}/estoque/remover")
def remover_estoque(
    produto_id: int,
    quantidade: float,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Remove quantidade do estoque"""
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    if produto.estoque_atual < quantidade:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Estoque insuficiente. Disponível: {produto.estoque_atual}"
        )
    
    produto.estoque_atual -= quantidade
    db.add(produto)
    db.commit()
    db.refresh(produto)
    
    return {
        "message": "Estoque reduzido",
        "produto_id": produto.id,
        "novo_estoque": float(produto.estoque_atual)
    }
