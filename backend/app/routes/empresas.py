from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.routes.auth import get_current_user
from app.models import Empresa
from app.schemas import EmpresaCreate, EmpresaResponse, EmpresaUpdate

router = APIRouter(prefix="/api/empresas", tags=["Empresas"])


@router.get("", response_model=List[EmpresaResponse])
def listar_empresas(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Lista todas as empresas com paginação"""
    return db.query(Empresa).offset(skip).limit(limit).all()


@router.get("/dados", response_model=Optional[EmpresaResponse])
def obter_dados_empresa(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Obtém os dados da primeira (única) empresa cadastrada"""
    empresa = db.query(Empresa).first()
    
    if not empresa:
        return None
    
    return empresa


@router.get("/{empresa_id}", response_model=EmpresaResponse)
def obter_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Obtém uma empresa específica"""
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )
    
    return empresa


@router.post("", response_model=EmpresaResponse)
def criar_empresa(
    empresa_data: EmpresaCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cria uma nova empresa"""
    # Verificar se já existe uma empresa com este CNPJ
    empresa_existente = db.query(Empresa).filter(Empresa.cnpj == empresa_data.cnpj).first()
    if empresa_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Já existe uma empresa com este CNPJ"
        )
    
    empresa = Empresa(**empresa_data.dict())
    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    
    return empresa


@router.put("/{empresa_id}", response_model=EmpresaResponse)
def atualizar_empresa(
    empresa_id: int,
    empresa_data: EmpresaUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Atualiza uma empresa existente"""
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )
    
    # Atualizar apenas os campos fornecidos
    dados_atualizacao = empresa_data.dict(exclude_unset=True)
    for campo, valor in dados_atualizacao.items():
        setattr(empresa, campo, valor)
    
    db.commit()
    db.refresh(empresa)
    
    return empresa


@router.delete("/{empresa_id}")
def deletar_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Deleta uma empresa"""
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )
    
    db.delete(empresa)
    db.commit()
    
    return {"detail": "Empresa deletada com sucesso"}
