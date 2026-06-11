from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Empresa(Base):
    """Modelo de dados da Empresa"""
    __tablename__ = "empresas"
    
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(255), nullable=False)
    cnpj = Column(String(18), nullable=False, unique=True)
    endereco = Column(String(255), nullable=False)
    numero = Column(String(20), nullable=False)
    complemento = Column(String(255), nullable=True)
    bairro = Column(String(100), nullable=False)
    cidade = Column(String(100), nullable=False)
    estado = Column(String(2), nullable=False)
    cep = Column(String(10), nullable=False)
    telefone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    margem_lucro_padrao = Column(Float, nullable=True, default=1.0)  # Margem padrão (1.0 = 100%)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<Empresa(id={self.id}, nome={self.nome}, cnpj={self.cnpj})>"
