from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class AuditLog(Base):
    """Modelo de log de auditoria do sistema"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    acao = Column(String(50), nullable=False, index=True)  # criar, editar, excluir, cancelar, concluir, login, logout, etc
    entidade = Column(String(50), nullable=False, index=True)  # venda, produto, usuario, cliente, empresa, etc
    entidade_id = Column(String(50), nullable=True)  # ID da entidade afetada (pode ser string para UUIDs)
    descricao = Column(Text, nullable=True)  # Descrição detalhada da ação
    ip_address = Column(String(45), nullable=True)  # IPv4 ou IPv6
    user_id = Column(Integer, nullable=True, index=True)  # ID do usuário responsável
    user_name = Column(String(50), nullable=True)  # Nome/username do usuário responsável
    created_at = Column(DateTime, server_default=func.now(), index=True)
    
    def __repr__(self):
        return f"<AuditLog(id={self.id}, acao={self.acao}, entidade={self.entidade}, user={self.user_name})>"
