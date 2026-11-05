from sqlalchemy import CheckConstraint, Column, Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Recebimento(Base):
    """Dinheiro recebido de um cliente. Só deixa de valer por estorno, nunca é apagado."""
    __tablename__ = "recebimentos"
    __table_args__ = (CheckConstraint("valor_total > 0", name="ck_recebimentos_valor_positivo"),)

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)
    data_pagamento = Column(Date, nullable=False)
    forma_pagamento = Column(String(50), nullable=False)
    valor_total = Column(Numeric(12, 2), nullable=False)
    origem = Column(String(20), nullable=False, default="avulso")  # avulso, conclusao, migracao
    observacoes = Column(String(255), nullable=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    estornado_em = Column(DateTime, nullable=True)
    estornado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    motivo_estorno = Column(String(255), nullable=True)

    alocacoes = relationship(
        "RecebimentoAlocacao",
        back_populates="recebimento",
        order_by="RecebimentoAlocacao.id",
    )


class RecebimentoAlocacao(Base):
    """Parte de um recebimento aplicada a uma venda. Imutável."""
    __tablename__ = "recebimento_alocacoes"
    __table_args__ = (CheckConstraint("valor > 0", name="ck_recebimento_alocacoes_valor_positivo"),)

    id = Column(Integer, primary_key=True, index=True)
    recebimento_id = Column(Integer, ForeignKey("recebimentos.id"), nullable=False, index=True)
    venda_id = Column(Integer, ForeignKey("vendas.id"), nullable=False, index=True)
    valor = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    recebimento = relationship("Recebimento", back_populates="alocacoes")
