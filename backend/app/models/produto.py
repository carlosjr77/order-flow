from sqlalchemy import Column, Integer, String, Numeric, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Produto(Base):
    """Modelo de Produto do estoque"""
    __tablename__ = "produtos"
    
    id = Column(Integer, primary_key=True, index=True)
    codigo_interno = Column(String(50), unique=True, index=True, nullable=False)
    descricao = Column(String(255), nullable=False, index=True)
    preco_custo = Column(Numeric(10, 2), nullable=False)
    preco_venda = Column(Numeric(10, 2), nullable=False)
    estoque_atual = Column(Numeric(10, 3), nullable=False, default=0)
    unidade_medida = Column(String(10), nullable=False, default="UN")  # KG, UN, LT, cx, etc
    ncm = Column(String(8), nullable=True)  # Código NCM
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<Produto(id={self.id}, codigo={self.codigo_interno}, descricao={self.descricao})>"
