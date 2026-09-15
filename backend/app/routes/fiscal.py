from io import BytesIO
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Cliente, Empresa, ItemVenda, NFe, Produto, Venda
from app.routes.auth import get_current_user
from app.utils.danfe import DanfeError, gerar_danfe_pdf
from app.utils.nfe_emissao import EmissaoNFeError, emitir_nfe


router = APIRouter(prefix="/api/fiscal", tags=["Fiscal"])
logger = logging.getLogger(__name__)


class EmitirNFeRequest(BaseModel):
    venda_id: int = Field(gt=0)


@router.post("/nfe/emitir")
def emitir_nfe_venda(
    payload: EmitirNFeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    del current_user
    empresa = db.query(Empresa).first()
    venda = db.query(Venda).filter(Venda.id == payload.venda_id, Venda.deleted_at.is_(None)).first()
    if not empresa or not venda:
        raise HTTPException(status_code=404, detail="Empresa ou venda não encontrada.")
    if not empresa.emissao_nfe_habilitada:
        raise HTTPException(status_code=422, detail="Emissão de NF-e está desabilitada no cadastro da empresa.")
    existente = db.query(NFe).filter(NFe.venda_id == venda.id).first()
    if existente and existente.status == "autorizada":
        return {
            "id": existente.id,
            "venda_id": venda.id,
            "status": existente.status,
            "chave_acesso": existente.chave_acesso,
            "numero": existente.numero,
            "serie": existente.serie,
            "danfe_url": f"/api/fiscal/nfe/{venda.id}/danfe",
        }

    itens = db.query(ItemVenda, Produto).join(Produto, ItemVenda.produto_id == Produto.id).filter(ItemVenda.venda_id == venda.id, ItemVenda.deleted_at.is_(None)).all()
    cliente = db.query(Cliente).filter(Cliente.nome == venda.nome_cliente).first() if venda.nome_cliente else None
    try:
        resultado = emitir_nfe(venda, empresa, cliente, itens)
    except EmissaoNFeError as exc:
        logger.warning("NF-e não emitida | venda_id=%s | motivo=%s", venda.id, str(exc))
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        logger.exception("NF-e falhou | venda_id=%s | certificado não encontrado", venda.id)
        raise HTTPException(status_code=422, detail="Certificado A1 não encontrado no backend.") from exc
    except PermissionError as exc:
        logger.exception("NF-e falhou | venda_id=%s | sem permissão para ler certificado", venda.id)
        raise HTTPException(status_code=422, detail="O backend não tem permissão para ler o certificado A1.") from exc
    except Exception as exc:
        logger.exception("NF-e falhou | venda_id=%s | erro inesperado na assinatura ou SEFAZ", venda.id)
        raise HTTPException(status_code=502, detail="Falha de comunicação com a SEFAZ em homologação.") from exc

    if not existente:
        existente = NFe(venda_id=venda.id, numero=resultado["numero"], serie=resultado["serie"])
        db.add(existente)
    for campo, valor in resultado.items():
        if hasattr(existente, campo):
            setattr(existente, campo, valor)
    existente.codigo_status = "100" if resultado["status"] == "autorizada" else None
    db.commit()
    db.refresh(existente)
    if resultado["status"] != "autorizada":
        logger.warning(
            "NF-e rejeitada pela SEFAZ | venda_id=%s | cStat=%s | motivo=%s",
            venda.id,
            resultado.get("codigo_status"),
            resultado.get("mensagem_status"),
        )
        raise HTTPException(status_code=422, detail=resultado.get("mensagem_status", "NF-e rejeitada pela SEFAZ."))
    empresa.numero_nfe = existente.numero + 1
    db.commit()
    db.refresh(existente)
    logger.info("NF-e autorizada | venda_id=%s | nfe_id=%s | chave=%s", venda.id, existente.id, existente.chave_acesso)
    return {"id": existente.id, "venda_id": venda.id, "status": existente.status, "chave_acesso": existente.chave_acesso, "numero": existente.numero, "serie": existente.serie, "danfe_url": f"/api/fiscal/nfe/{venda.id}/danfe"}


@router.get("/nfe/{venda_id}/danfe", response_class=StreamingResponse)
def danfe_nfe_autorizada(
    venda_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    del current_user
    nota = db.query(NFe).filter(NFe.venda_id == venda_id, NFe.status == "autorizada").first()
    if not nota or not nota.xml_autorizado:
        raise HTTPException(status_code=404, detail="NF-e autorizada não encontrada.")
    try:
        pdf, chave = gerar_danfe_pdf(nota.xml_autorizado)
    except DanfeError as exc:
        raise HTTPException(status_code=422, detail="Não foi possível gerar a DANFE da NF-e autorizada.") from exc
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="DANFE-{chave}.pdf"'})
