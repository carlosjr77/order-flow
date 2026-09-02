from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Empresa, ItemVenda, NFe, Produto, Venda
from app.routes.auth import get_current_user
from app.utils.danfe import DanfeError, gerar_danfe_pdf
from app.utils.nfe_emissao import EmissaoNFeError, emitir_nfe


router = APIRouter(prefix="/api/fiscal", tags=["Fiscal"])


class DanfeRequest(BaseModel):
    xml: str = Field(min_length=1)


class EmitirNFeRequest(BaseModel):
    venda_id: int = Field(gt=0)


@router.post("/danfe/gerar-pdf", response_class=StreamingResponse)
def gerar_pdf_danfe(
    payload: DanfeRequest,
    current_user: dict = Depends(get_current_user),
):
    del current_user

    try:
        pdf, chave = gerar_danfe_pdf(payload.xml)
    except DanfeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nao foi possivel gerar a DANFE: O XML da nota fiscal nao foi localizado ou e invalido.",
        ) from exc

    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="DANFE-{chave}.pdf"',
        },
    )


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
        raise HTTPException(status_code=409, detail="Esta venda já possui uma NF-e autorizada.")

    itens = db.query(ItemVenda, Produto).join(Produto, ItemVenda.produto_id == Produto.id).filter(ItemVenda.venda_id == venda.id, ItemVenda.deleted_at.is_(None)).all()
    try:
        resultado = emitir_nfe(venda, empresa, itens)
    except EmissaoNFeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
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
        raise HTTPException(status_code=422, detail=resultado.get("mensagem_status", "NF-e rejeitada pela SEFAZ."))
    empresa.numero_nfe = existente.numero + 1
    db.commit()
    db.refresh(existente)
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
