from __future__ import annotations

from io import BytesIO
import re
from xml.etree import ElementTree


class DanfeError(ValueError):
    """Erro de entrada ou conversao de uma NF-e em DANFE."""


_NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe"
_NFE_TAG = f"{{{_NFE_NAMESPACE}}}NFe"
_INF_NFE_TAG = f"{{{_NFE_NAMESPACE}}}infNFe"


def validar_e_obter_chave(xml: str) -> str:
    if not isinstance(xml, str) or not xml.strip():
        raise DanfeError("O XML da nota fiscal nao foi localizado ou e invalido.")

    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError as exc:
        raise DanfeError("O XML da nota fiscal nao foi localizado ou e invalido.") from exc

    inf_nfe = root.find(f".//{_INF_NFE_TAG}")
    if root.tag != _NFE_TAG and inf_nfe is None:
        raise DanfeError("O XML da nota fiscal nao foi localizado ou e invalido.")

    if inf_nfe is None:
        raise DanfeError("O XML da nota fiscal nao foi localizado ou e invalido.")

    chave = (inf_nfe.attrib.get("Id") or "").removeprefix("NFe")
    if not re.fullmatch(r"\d{44}", chave):
        raise DanfeError("O XML da nota fiscal nao foi localizado ou e invalido.")

    return chave


def gerar_danfe_pdf(xml: str) -> tuple[BytesIO, str]:
    chave = validar_e_obter_chave(xml)

    try:
        from brazilfiscalreport.danfe import Danfe

        documento = Danfe(xml=xml)
        conteudo = documento.output(dest="S")
    except Exception as exc:
        raise DanfeError("Nao foi possivel converter o XML em DANFE.") from exc

    if isinstance(conteudo, str):
        conteudo = conteudo.encode("latin-1")
    if not isinstance(conteudo, bytes) or not conteudo:
        raise DanfeError("Nao foi possivel converter o XML em DANFE.")

    return BytesIO(conteudo), chave
