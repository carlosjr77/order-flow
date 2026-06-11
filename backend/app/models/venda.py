from sqlalchemy import Column, Integer, Numeric, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Venda(Base):
    """Modelo de Venda"""
    __tablename__ = "vendas"
    
    id = Column(Integer, primary_key=True, index=True)
    data_venda = Column(DateTime, server_default=func.now(), index=True, default=func.now())
    valor_total = Column(Numeric(10, 2), nullable=False, default=0)
    valor_frete = Column(Numeric(10, 2), nullable=True, default=0)  # Valor do frete
    status = Column(String(20), nullable=False, default="pendente")  # pendente, concluído, cancelado
    forma_pagamento = Column(String(50), nullable=True)  # Dinheiro, Crédito, Débito, PIX
    observacoes = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime, nullable=True)  # Exclusão lógica
    
    def __repr__(self):
        return f"<Venda(id={self.id}, valor={self.valor_total}, status={self.status})>"
