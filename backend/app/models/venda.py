from sqlalchemy import Column, Integer, Numeric, String, DateTime, Date, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class Venda(Base):
    """Modelo de Venda"""
    __tablename__ = "vendas"
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)  # Usuário que registrou a venda
    data_venda = Column(DateTime, server_default=func.now(), index=True, default=func.now())
    data_entrega = Column(Date, nullable=True)  # Data de entrega (pode ser passado ou futuro)
    data_vencimento = Column(Date, nullable=True)  # Data de vencimento do pedido (opcional)
    valor_total = Column(Numeric(10, 2), nullable=False, default=0)
    valor_frete = Column(Numeric(10, 2), nullable=True, default=0)  # Valor do frete
    status = Column(String(20), nullable=False, default="pendente")  # pendente, concluído, cancelado
    forma_pagamento = Column(String(50), nullable=True)  # Dinheiro, Crédito, Débito, PIX
    observacoes = Column(String(255), nullable=True)
    nome_cliente = Column(String(255), nullable=True)  # Nome do cliente da venda
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime, nullable=True)  # Exclusão lógica
    motivo_cancelamento = Column(String(255), nullable=True)  # Motivo do cancelamento/exclusão
    
    def __repr__(self):
        return f"<Venda(id={self.id}, valor={self.valor_total}, status={self.status})>"
