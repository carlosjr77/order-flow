"""Utilitários de auditoria do sistema"""
from sqlalchemy.orm import Session
from app.models import AuditLog


def registrar_auditoria(
    db: Session,
    acao: str,
    entidade: str,
    entidade_id: str = None,
    descricao: str = None,
    user_id: int = None,
    user_name: str = None,
    ip_address: str = None
) -> AuditLog:
    """Registra uma entrada no log de auditoria"""
    log = AuditLog(
        acao=acao,
        entidade=entidade,
        entidade_id=str(entidade_id) if entidade_id is not None else None,
        descricao=descricao,
        user_id=user_id,
        user_name=user_name,
        ip_address=ip_address
    )
    db.add(log)
    db.commit()
    return log


def get_client_ip(request) -> str:
    """Extrai o endereço IP do cliente a partir da requisição"""
    # Verificar headers de proxy comuns
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        # Pega o primeiro IP da lista
        return x_forwarded_for.split(",")[0].strip()
    
    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip:
        return x_real_ip
    
    # Fallback para o IP direto da conexão
    if hasattr(request, 'client') and request.client:
        return request.client.host
    
    return None
