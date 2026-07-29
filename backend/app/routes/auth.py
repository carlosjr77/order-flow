from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import timedelta
from app.core.database import get_db
from app.core.security import (
    verify_password,
    create_access_token,
    get_password_hash,
    decode_token
)
from app.core.config import settings
from app.models import Usuario
from app.schemas import (
    UsuarioCreate, TokenResponse, UsuarioResponse, LoginRequest,
    UsuarioTrocaSenha, UsuarioResetSenha
)
from app.utils.audit import registrar_auditoria, get_client_ip
from fastapi.security import HTTPBearer

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
security = HTTPBearer()


def get_current_user(credentials = Depends(security)) -> dict:
    """Obtém o usuário atual a partir do token JWT"""
    token = credentials.credentials
    payload = decode_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado"
        )
    
    return payload


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency que garante que o usuário atual é admin"""
    if current_user.get("perfil") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores"
        )
    return current_user


def require_usuario_ativo(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Usuario:
    """Obtém o usuário ativo do banco a partir do token JWT"""
    usuario = db.query(Usuario).filter(Usuario.id == current_user.get("user_id")).first()
    
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    if not usuario.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo"
        )
    
    return usuario


@router.post("/login", response_model=TokenResponse)
def login(
    login_data: LoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Login do usuário com username e password"""
    
    username = login_data.username
    password = login_data.password
    
    # Buscar usuário no banco de dados
    usuario = db.query(Usuario).filter(Usuario.username == username).first()
    
    if not usuario or not verify_password(password, usuario.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha incorretos"
        )
    
    if not usuario.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo"
        )
    
    # Criar token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": usuario.username,
            "user_id": usuario.id,
            "perfil": usuario.perfil,
            "nome": usuario.nome or usuario.username
        },
        expires_delta=access_token_expires
    )
    
    # Registrar auditoria de login
    registrar_auditoria(
        db=db,
        acao="login",
        entidade="usuario",
        entidade_id=usuario.id,
        descricao=f"Usuário '{usuario.username}' realizou login no sistema",
        user_id=usuario.id,
        user_name=usuario.username,
        ip_address=get_client_ip(request)
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "usuario": {
            "id": usuario.id,
            "username": usuario.username,
            "email": usuario.email,
            "nome": usuario.nome,
            "is_active": usuario.is_active,
            "perfil": usuario.perfil,
            "created_at": usuario.created_at
        }
    }


@router.post("/register", response_model=TokenResponse)
def register(usuario_data: UsuarioCreate, db: Session = Depends(get_db)):
    """Registro de novo usuário (operador por padrão)"""
    
    # Verificar se usuário já existe
    user_exists = db.query(Usuario).filter(Usuario.username == usuario_data.username).first()
    if user_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário já existe"
        )
    
    # Criar novo usuário
    novo_usuario = Usuario(
        username=usuario_data.username,
        email=usuario_data.email,
        nome=usuario_data.nome,
        hashed_password=get_password_hash(usuario_data.password),
        is_active=True,
        perfil="operador"
    )
    
    db.add(novo_usuario)
    db.commit()
    db.refresh(novo_usuario)
    
    # Criar token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": novo_usuario.username,
            "user_id": novo_usuario.id,
            "perfil": novo_usuario.perfil,
            "nome": novo_usuario.nome or novo_usuario.username
        },
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "usuario": {
            "id": novo_usuario.id,
            "username": novo_usuario.username,
            "email": novo_usuario.email,
            "nome": novo_usuario.nome,
            "is_active": novo_usuario.is_active,
            "perfil": novo_usuario.perfil,
            "created_at": novo_usuario.created_at
        }
    }


@router.get("/me", response_model=UsuarioResponse)
def get_me(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Obtém dados do usuário atual"""
    usuario = db.query(Usuario).filter(Usuario.id == current_user["user_id"]).first()
    
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    return usuario


@router.post("/trocar-senha")
def trocar_senha(
    dados: UsuarioTrocaSenha,
    request: Request,
    usuario: Usuario = Depends(require_usuario_ativo),
    db: Session = Depends(get_db)
):
    """Permite que qualquer usuário logado altere sua própria senha"""
    
    # Verificar senha atual
    if not verify_password(dados.senha_atual, usuario.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta"
        )
    
    # Atualizar senha
    usuario.hashed_password = get_password_hash(dados.nova_senha)
    db.add(usuario)
    db.commit()
    
    # Registrar auditoria
    registrar_auditoria(
        db=db,
        acao="trocar_senha",
        entidade="usuario",
        entidade_id=usuario.id,
        descricao=f"Usuário '{usuario.username}' alterou sua própria senha",
        user_id=usuario.id,
        user_name=usuario.username,
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Senha alterada com sucesso"}


@router.post("/logout")
def logout(
    request: Request,
    usuario: Usuario = Depends(require_usuario_ativo),
    db: Session = Depends(get_db)
):
    """Registra logout do usuário"""
    registrar_auditoria(
        db=db,
        acao="logout",
        entidade="usuario",
        entidade_id=usuario.id,
        descricao=f"Usuário '{usuario.username}' realizou logout do sistema",
        user_id=usuario.id,
        user_name=usuario.username,
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Logout registrado com sucesso"}
