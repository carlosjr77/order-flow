from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.sql import func

from app.core.database import Base


class ProdutoCustoHistorico(Base):
    """Cada alteração do preço de custo de um produto. Nunca é editado nem apagado."""
    __tablename__ = "produto_custo_historico"

    id = Column(Integer, primary_key=True, index=True)
    produto_id = Column(Integer, ForeignKey("produtos.id", ondelete="CASCADE"), nullable=False, index=True)
    custo_anterior = Column(Numeric(10, 2), nullable=False)
    custo_novo = Column(Numeric(10, 2), nullable=False)
    origem = Column(String(20), nullable=False, default="manual")  # manual, ceasa_sem_nf, nf
    observacao = Column(String(255), nullable=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    usuario_nome = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    def __repr__(self):
        return f"<ProdutoCustoHistorico(produto_id={self.produto_id}, {self.custo_anterior} -> {self.custo_novo})>"
