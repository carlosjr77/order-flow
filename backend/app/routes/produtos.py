from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.routes.auth import get_current_user
from app.models import Produto, Usuario
from app.schemas import ProdutoCreate, ProdutoResponse, ProdutoUpdate
from app.utils.audit import registrar_auditoria, get_client_ip

router = APIRouter(prefix="/api/produtos", tags=["Produtos"])


def get_usuario_logado(db: Session, current_user: dict) -> Usuario:
    """Obtém o objeto Usuario completo a partir do token"""
    return db.query(Usuario).filter(Usuario.id == current_user.get("user_id")).first()


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
    request: Request,
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
        margem_lucro=produto_data.margem_lucro,
        unidade_medida=produto_data.unidade_medida,
        ncm=produto_data.ncm,
        estoque_atual=produto_data.estoque_inicial or 0,
        vender_sem_estoque=1 if produto_data.vender_sem_estoque else 0
    )
    
    db.add(novo_produto)
    db.commit()
    db.refresh(novo_produto)
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="criar",
        entidade="produto",
        entidade_id=novo_produto.id,
        descricao=f"Produto '{novo_produto.descricao}' (código: {novo_produto.codigo_interno}) criado por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return novo_produto


@router.put("/{produto_id}", response_model=ProdutoResponse)
def atualizar_produto(
    produto_id: int,
    produto_data: ProdutoUpdate,
    request: Request,
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
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="editar",
        entidade="produto",
        entidade_id=produto.id,
        descricao=f"Produto '{produto.descricao}' (código: {produto.codigo_interno}) atualizado por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return produto


@router.delete("/{produto_id}")
def deletar_produto(
    produto_id: int,
    request: Request,
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
    
    descricao = f"Produto '{produto.descricao}' (código: {produto.codigo_interno}) deletado"
    db.delete(produto)
    db.commit()
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="excluir",
        entidade="produto",
        entidade_id=produto_id,
        descricao=f"{descricao} por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Produto deletado com sucesso"}


@router.put("/{produto_id}/estoque/adicionar")
def adicionar_estoque(
    produto_id: int,
    quantidade: float,
    request: Request,
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
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="ajuste_estoque",
        entidade="produto",
        entidade_id=produto.id,
        descricao=f"Estoque do produto '{produto.descricao}' adicionado em {quantidade} unidades por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {
        "message": "Estoque atualizado",
        "produto_id": produto.id,
        "novo_estoque": float(produto.estoque_atual)
    }


@router.put("/{produto_id}/estoque/remover")
def remover_estoque(
    produto_id: int,
    quantidade: float,
    request: Request,
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
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="ajuste_estoque",
        entidade="produto",
        entidade_id=produto.id,
        descricao=f"Estoque do produto '{produto.descricao}' removido em {quantidade} unidades por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {
        "message": "Estoque reduzido",
        "produto_id": produto.id,
        "novo_estoque": float(produto.estoque_atual)
    }
