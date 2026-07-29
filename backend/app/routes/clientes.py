from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.routes.auth import get_current_user
from app.models import Cliente, Usuario
from app.schemas import ClienteCreate, ClienteResponse, ClienteUpdate
from app.utils.audit import registrar_auditoria, get_client_ip

router = APIRouter(prefix="/api/clientes", tags=["Clientes"])


def get_usuario_logado(db: Session, current_user: dict) -> Usuario:
    """Obtém o objeto Usuario completo a partir do token"""
    return db.query(Usuario).filter(Usuario.id == current_user.get("user_id")).first()


@router.get("", response_model=List[ClienteResponse])
def listar_clientes(
    skip: int = 0,
    limit: int = 100,
    busca: str = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Lista todos os clientes com paginação e busca opcional"""
    query = db.query(Cliente)
    
    if busca:
        query = query.filter(
            (Cliente.nome.ilike(f"%{busca}%")) |
            (Cliente.documento.ilike(f"%{busca}%"))
        )
    
    return query.offset(skip).limit(limit).all()


@router.get("/{cliente_id}", response_model=ClienteResponse)
def obter_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Obtém um cliente específico"""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente não encontrado"
        )
    
    return cliente


@router.post("", response_model=ClienteResponse)
def criar_cliente(
    cliente_data: ClienteCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cria um novo cliente"""
    
    # Verificar se documento já existe (se fornecido)
    if cliente_data.documento:
        cliente_existente = db.query(Cliente).filter(
            Cliente.documento == cliente_data.documento
        ).first()
        
        if cliente_existente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cliente com este documento já existe"
            )
    
    novo_cliente = Cliente(
        nome=cliente_data.nome,
        documento=cliente_data.documento,
        email=cliente_data.email,
        telefone=cliente_data.telefone,
        endereco=cliente_data.endereco,
        numero=cliente_data.numero,
        complemento=cliente_data.complemento,
        bairro=cliente_data.bairro,
        cidade=cliente_data.cidade,
        estado=cliente_data.estado,
        cep=cliente_data.cep
    )
    
    db.add(novo_cliente)
    db.commit()
    db.refresh(novo_cliente)
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="criar",
        entidade="cliente",
        entidade_id=novo_cliente.id,
        descricao=f"Cliente '{novo_cliente.nome}' criado por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return novo_cliente


@router.put("/{cliente_id}", response_model=ClienteResponse)
def atualizar_cliente(
    cliente_id: int,
    cliente_data: ClienteUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Atualiza um cliente existente"""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente não encontrado"
        )
    
    # Atualizar apenas os campos fornecidos
    update_data = cliente_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cliente, field, value)
    
    db.commit()
    db.refresh(cliente)
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="editar",
        entidade="cliente",
        entidade_id=cliente.id,
        descricao=f"Cliente '{cliente.nome}' atualizado por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return cliente


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_cliente(
    cliente_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Deleta um cliente"""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente não encontrado"
        )
    
    descricao = f"Cliente '{cliente.nome}' deletado"
    db.delete(cliente)
    db.commit()
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="excluir",
        entidade="cliente",
        entidade_id=cliente_id,
        descricao=f"{descricao} por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return None
