from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Usuario(Base):
    """Modelo de Usuário do sistema"""
    __tablename__ = "usuarios"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    nome = Column(String(100), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    perfil = Column(String(20), nullable=False, default="operador")  # admin, operador
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    @property
    def is_admin(self) -> bool:
        """Compatibilidade retroativa com o campo booleano antigo"""
        return self.perfil == "admin"
    
    def __repr__(self):
        return f"<Usuario(id={self.id}, username={self.username}, perfil={self.perfil})>"
