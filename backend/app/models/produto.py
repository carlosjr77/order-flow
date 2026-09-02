from sqlalchemy import Column, Integer, String, Numeric, Float, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Produto(Base):
    """Modelo de Produto do estoque"""
    __tablename__ = "produtos"
    
    id = Column(Integer, primary_key=True, index=True)
    codigo_interno = Column(String(50), unique=True, index=True, nullable=False)
    descricao = Column(String(255), nullable=False, index=True)
    preco_custo = Column(Numeric(10, 2), nullable=False)
    preco_venda = Column(Numeric(10, 2), nullable=True)  # Agora opcional, pode ser calculado pela margem
    margem_lucro = Column(Float, nullable=True)  # Margem de lucro específica do produto (em decimal, ex: 1.0 = 100%)
    estoque_atual = Column(Numeric(10, 3), nullable=False, default=0)
    unidade_medida = Column(String(10), nullable=False, default="UN")  # KG, UN, LT, cx, etc
    ncm = Column(String(8), nullable=True)  # Código NCM
    cest = Column(String(7), nullable=True)
    cfop = Column(String(4), nullable=True)
    csosn = Column(String(3), nullable=True)
    aliquota_icms = Column(Float, nullable=True, default=0)
    aliquota_pis = Column(Float, nullable=True, default=0)
    aliquota_cofins = Column(Float, nullable=True, default=0)
    vender_sem_estoque = Column(Integer, nullable=False, default=1)  # 1=permite vender sem estoque (default), 0=nao permite
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<Produto(id={self.id}, codigo={self.codigo_interno}, descricao={self.descricao})>"
