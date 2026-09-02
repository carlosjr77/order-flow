from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class NFe(Base):
    __tablename__ = "nfes"

    id = Column(Integer, primary_key=True, index=True)
    venda_id = Column(Integer, ForeignKey("vendas.id"), nullable=False, unique=True, index=True)
    chave_acesso = Column(String(44), nullable=True, unique=True, index=True)
    numero = Column(Integer, nullable=False)
    serie = Column(Integer, nullable=False)
    ambiente = Column(String(15), nullable=False, default="homologacao")
    status = Column(String(30), nullable=False, default="pendente")
    codigo_status = Column(String(10), nullable=True)
    mensagem_status = Column(String(500), nullable=True)
    protocolo = Column(String(50), nullable=True)
    xml_assinado = Column(Text, nullable=True)
    xml_autorizado = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())