from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.core.database import get_db
from app.routes.auth import require_admin
from app.models import AuditLog
from app.schemas import AuditLogResponse, AuditLogFilter

router = APIRouter(prefix="/api/audit", tags=["Auditoria"])


@router.get("", response_model=List[AuditLogResponse])
def listar_logs(
    skip: int = 0,
    limit: int = 100,
    acao: Optional[str] = None,
    entidade: Optional[str] = None,
    user_id: Optional[int] = None,
    data_inicio: Optional[datetime] = None,
    data_fim: Optional[datetime] = None,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Lista logs de auditoria com filtros (apenas admin)"""
    
    query = db.query(AuditLog)
    
    if acao:
        query = query.filter(AuditLog.acao == acao)
    
    if entidade:
        query = query.filter(AuditLog.entidade == entidade)
    
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    
    if data_inicio:
        query = query.filter(AuditLog.created_at >= data_inicio)
    
    if data_fim:
        query = query.filter(AuditLog.created_at <= data_fim)
    
    # Ordenar do mais recente para o mais antigo
    query = query.order_by(AuditLog.created_at.desc())
    
    return query.offset(skip).limit(limit).all()


@router.get("/acoes")
def listar_acoes(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Lista todas as ações distintas registradas nos logs (apenas admin)"""
    acoes = db.query(AuditLog.acao).distinct().order_by(AuditLog.acao).all()
    return [acao[0] for acao in acoes if acao[0]]


@router.get("/entidades")
def listar_entidades(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Lista todas as entidades distintas registradas nos logs (apenas admin)"""
    entidades = db.query(AuditLog.entidade).distinct().order_by(AuditLog.entidade).all()
    return [entidade[0] for entidade in entidades if entidade[0]]


@router.get("/estatisticas")
def estatisticas_auditoria(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Retorna estatísticas gerais dos logs de auditoria (apenas admin)"""
    total = db.query(AuditLog).count()
    
    # Total nas últimas 24 horas
    from datetime import timedelta
    ultimas_24h = db.query(AuditLog).filter(
        AuditLog.created_at >= datetime.utcnow() - timedelta(hours=24)
    ).count()
    
    return {
        "total_logs": total,
        "ultimas_24h": ultimas_24h
    }
