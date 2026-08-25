from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class TabelaPreco(Base):
    """Modelo de Tabela de Preços"""
    __tablename__ = "tabelas_preco"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(255), nullable=False, index=True)
    descricao = Column(String(255), nullable=True)
    margem_geral_percentual = Column(Numeric(10, 2), nullable=False, default=0)
    ativa = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<TabelaPreco(id={self.id}, nome={self.nome})>"


class TabelaPrecoItem(Base):
    """Exceção de margem por produto dentro de uma Tabela de Preços"""
    __tablename__ = "tabela_preco_itens"
    __table_args__ = (
        UniqueConstraint("tabela_preco_id", "produto_id", name="uq_tabela_preco_produto"),
    )

    id = Column(Integer, primary_key=True, index=True)
    tabela_preco_id = Column(Integer, ForeignKey("tabelas_preco.id", ondelete="CASCADE"), nullable=False, index=True)
    produto_id = Column(Integer, ForeignKey("produtos.id", ondelete="CASCADE"), nullable=False, index=True)
    margem_especifica_percentual = Column(Numeric(10, 2), nullable=False, default=0)
    preco_calculado = Column(Numeric(10, 2), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<TabelaPrecoItem(id={self.id}, tabela_preco_id={self.tabela_preco_id}, produto_id={self.produto_id})>"
