from sqlalchemy import Column, Integer, Numeric, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class ItemVenda(Base):
    """Modelo de Item de Venda"""
    __tablename__ = "itens_venda"
    
    id = Column(Integer, primary_key=True, index=True)
    venda_id = Column(Integer, ForeignKey("vendas.id", ondelete="CASCADE"), nullable=False, index=True)
    produto_id = Column(Integer, ForeignKey("produtos.id"), nullable=False, index=True)
    quantidade = Column(Numeric(10, 3), nullable=False)
    valor_unitario = Column(Numeric(10, 2), nullable=False)
    valor_total = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<ItemVenda(id={self.id}, venda_id={self.venda_id}, produto_id={self.produto_id})>"
