from fastapi import APIRouter, Depends, HTTPException, status
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
from app.schemas import UsuarioCreate, TokenResponse, UsuarioResponse, LoginRequest
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


@router.post("/login", response_model=TokenResponse)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    """Login do usuário com username e password
    
    **Credenciais padrão:**
    - username: admin
    - password: admin123
    """
    
    username = login_data.username
    password = login_data.password
    
    # Verificar contra credenciais fixas configuradas
    if username == settings.ADMIN_USERNAME and password == settings.ADMIN_PASSWORD:
        # Buscar ou criar usuário admin
        usuario = db.query(Usuario).filter(Usuario.username == username).first()
        
        if not usuario:
            usuario = Usuario(
                username=username,
                email="admin@orderflow.local",
                hashed_password=get_password_hash(password),
                is_admin=True,
                is_active=True
            )
            db.add(usuario)
            db.commit()
            db.refresh(usuario)
        
        # Criar token
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": usuario.username, "user_id": usuario.id},
            expires_delta=access_token_expires
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "usuario": {
                "id": usuario.id,
                "username": usuario.username,
                "email": usuario.email,
                "is_active": usuario.is_active,
                "is_admin": usuario.is_admin,
                "created_at": usuario.created_at
            }
        }
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Usuário ou senha incorretos"
    )


@router.post("/register", response_model=TokenResponse)
def register(usuario_data: UsuarioCreate, db: Session = Depends(get_db)):
    """Registro de novo usuário"""
    
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
        hashed_password=get_password_hash(usuario_data.password),
        is_active=True,
        is_admin=False
    )
    
    db.add(novo_usuario)
    db.commit()
    db.refresh(novo_usuario)
    
    # Criar token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": novo_usuario.username, "user_id": novo_usuario.id},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "usuario": {
            "id": novo_usuario.id,
            "username": novo_usuario.username,
            "email": novo_usuario.email,
            "is_active": novo_usuario.is_active,
            "is_admin": novo_usuario.is_admin,
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
