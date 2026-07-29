from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password
from app.routes.auth import require_admin, require_usuario_ativo
from app.models import Usuario
from app.schemas import (
    UsuarioCreate, UsuarioResponse, UsuarioUpdate,
    UsuarioResetSenha
)
from app.utils.audit import registrar_auditoria, get_client_ip
import secrets
import string

router = APIRouter(prefix="/api/usuarios", tags=["Usuários"])


def gerar_senha_padrao(length: int = 10) -> str:
    """Gera uma senha padrão segura"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


@router.get("", response_model=List[UsuarioResponse])
def listar_usuarios(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Lista todos os usuários (apenas admin)"""
    return db.query(Usuario).offset(skip).limit(limit).all()


@router.get("/{usuario_id}", response_model=UsuarioResponse)
def obter_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Obtém um usuário específico (apenas admin)"""
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    return usuario


@router.post("", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
def criar_usuario(
    usuario_data: UsuarioCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Cria um novo usuário (apenas admin)"""
    
    # Verificar se username já existe
    user_exists = db.query(Usuario).filter(Usuario.username == usuario_data.username).first()
    if user_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário já existe"
        )
    
    # Verificar se email já existe
    email_exists = db.query(Usuario).filter(Usuario.email == usuario_data.email).first()
    if email_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já cadastrado"
        )
    
    # Usar senha fornecida ou gerar uma padrão
    senha = usuario_data.password or gerar_senha_padrao()
    
    novo_usuario = Usuario(
        username=usuario_data.username,
        email=usuario_data.email,
        nome=usuario_data.nome,
        hashed_password=get_password_hash(senha),
        is_active=True,
        perfil=usuario_data.perfil or "operador"
    )
    
    db.add(novo_usuario)
    db.commit()
    db.refresh(novo_usuario)
    
    # Registrar auditoria
    admin_usuario = db.query(Usuario).filter(Usuario.id == admin.get("user_id")).first()
    registrar_auditoria(
        db=db,
        acao="criar",
        entidade="usuario",
        entidade_id=novo_usuario.id,
        descricao=f"Usuário '{novo_usuario.username}' criado com perfil '{novo_usuario.perfil}' por '{admin_usuario.username if admin_usuario else 'admin'}'",
        user_id=admin.get("user_id"),
        user_name=admin_usuario.username if admin_usuario else admin.get("sub"),
        ip_address=get_client_ip(request)
    )
    
    return novo_usuario


@router.put("/{usuario_id}", response_model=UsuarioResponse)
def atualizar_usuario(
    usuario_id: int,
    usuario_data: UsuarioUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Atualiza um usuário existente (apenas admin)"""
    
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    # Verificar se username já existe em outro usuário
    if usuario_data.username:
        existing = db.query(Usuario).filter(
            Usuario.username == usuario_data.username,
            Usuario.id != usuario_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nome de usuário já em uso"
            )
    
    # Verificar se email já existe em outro usuário
    if usuario_data.email:
        existing = db.query(Usuario).filter(
            Usuario.email == usuario_data.email,
            Usuario.id != usuario_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email já em uso"
            )
    
    # Atualizar apenas campos fornecidos
    update_data = usuario_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(usuario, field, value)
    
    db.commit()
    db.refresh(usuario)
    
    # Registrar auditoria
    admin_usuario = db.query(Usuario).filter(Usuario.id == admin.get("user_id")).first()
    registrar_auditoria(
        db=db,
        acao="editar",
        entidade="usuario",
        entidade_id=usuario.id,
        descricao=f"Usuário '{usuario.username}' atualizado por '{admin_usuario.username if admin_usuario else 'admin'}'",
        user_id=admin.get("user_id"),
        user_name=admin_usuario.username if admin_usuario else admin.get("sub"),
        ip_address=get_client_ip(request)
    )
    
    return usuario


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_usuario(
    usuario_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Desativa um usuário (apenas admin) - não remove do banco por segurança"""
    
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    # Impedir que o admin se desative
    if usuario.id == admin.get("user_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível desativar o próprio usuário"
        )
    
    usuario.is_active = False
    db.commit()
    
    # Registrar auditoria
    admin_usuario = db.query(Usuario).filter(Usuario.id == admin.get("user_id")).first()
    registrar_auditoria(
        db=db,
        acao="desativar",
        entidade="usuario",
        entidade_id=usuario.id,
        descricao=f"Usuário '{usuario.username}' desativado por '{admin_usuario.username if admin_usuario else 'admin'}'",
        user_id=admin.get("user_id"),
        user_name=admin_usuario.username if admin_usuario else admin.get("sub"),
        ip_address=get_client_ip(request)
    )
    
    return None


@router.post("/{usuario_id}/resetar-senha")
def resetar_senha(
    usuario_id: int,
    dados: UsuarioResetSenha,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Reseta a senha de um usuário (apenas admin)"""
    
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    # Atualizar senha
    usuario.hashed_password = get_password_hash(dados.nova_senha)
    db.commit()
    
    # Registrar auditoria
    admin_usuario = db.query(Usuario).filter(Usuario.id == admin.get("user_id")).first()
    registrar_auditoria(
        db=db,
        acao="resetar_senha",
        entidade="usuario",
        entidade_id=usuario.id,
        descricao=f"Senha do usuário '{usuario.username}' resetada por '{admin_usuario.username if admin_usuario else 'admin'}'",
        user_id=admin.get("user_id"),
        user_name=admin_usuario.username if admin_usuario else admin.get("sub"),
        ip_address=get_client_ip(request)
    )
    
    return {"message": f"Senha do usuário '{usuario.username}' resetada com sucesso"}


@router.post("/{usuario_id}/reativar")
def reativar_usuario(
    usuario_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Reativa um usuário desativado (apenas admin)"""
    
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    usuario.is_active = True
    db.commit()
    
    # Registrar auditoria
    admin_usuario = db.query(Usuario).filter(Usuario.id == admin.get("user_id")).first()
    registrar_auditoria(
        db=db,
        acao="reativar",
        entidade="usuario",
        entidade_id=usuario.id,
        descricao=f"Usuário '{usuario.username}' reativado por '{admin_usuario.username if admin_usuario else 'admin'}'",
        user_id=admin.get("user_id"),
        user_name=admin_usuario.username if admin_usuario else admin.get("sub"),
        ip_address=get_client_ip(request)
    )
    
    return {"message": f"Usuário '{usuario.username}' reativado com sucesso"}


@router.get("/perfil/opcoes")
def listar_perfis(
    admin: dict = Depends(require_admin)
):
    """Retorna os perfis disponíveis (apenas admin)"""
    return [
        {"valor": "admin", "label": "Administrador", "descricao": "Acesso total ao sistema"},
        {"valor": "operador", "label": "Operador", "descricao": "Pode realizar vendas, mas não excluir/cancelar pedidos"}
    ]
