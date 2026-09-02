from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
import re
from typing import Any

from app.core.config import settings
from app.models import Empresa, ItemVenda, Produto, Venda

NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe"


class EmissaoNFeError(ValueError):
    pass


def _numeros(valor: str | None) -> str:
    return re.sub(r"\D", "", valor or "")


def _decimal(valor: Any) -> Decimal:
    return Decimal(str(valor or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _texto(valor: Any) -> str:
    return str(valor or "")


def _chave_nfe(empresa: Empresa, venda: Venda, numero: int, serie: int) -> str:
    uf = {"RJ": "33"}.get((empresa.estado or settings.NFE_UF).upper())
    if not uf:
        raise EmissaoNFeError("UF sem código IBGE configurado para emissão de NF-e.")
    cnpj = _numeros(empresa.cnpj)
    if len(cnpj) != 14:
        raise EmissaoNFeError("CNPJ do emitente inválido.")
    data = (venda.data_venda or datetime.now()).strftime("%y%m")
    codigo_nfe = f"{(venda.id * 7919) % 100000000:08d}"
    base = f"{uf}{data}{cnpj}55{serie:03d}{numero:09d}1{codigo_nfe}"
    peso = 2
    total = 0
    for digito in reversed(base):
        total += int(digito) * peso
        peso = 2 if peso == 9 else peso + 1
    resto = total % 11
    dv = 0 if resto in (0, 1) else 11 - resto
    return base + str(dv)


def _configurar_elemento(elemento: Any, nome: str, valor: Any) -> Any:
    filho = elemento.makeelement(nome, {})
    filho.text = _texto(valor)
    elemento.append(filho)
    return filho


def montar_xml_nfe(venda: Venda, empresa: Empresa, itens: list[tuple[ItemVenda, Produto]]) -> tuple[Any, str, int, int]:
    if not empresa.inscricao_estadual:
        raise EmissaoNFeError("Inscrição Estadual da empresa não configurada.")
    if not empresa.codigo_municipio_ibge:
        raise EmissaoNFeError("Código IBGE do município da empresa não configurado.")
    if not empresa.cfop_dentro_estado or not empresa.cfop_fora_estado:
        raise EmissaoNFeError("CFOP dentro e fora do estado devem ser configurados.")
    if not empresa.csosn_padrao:
        raise EmissaoNFeError("CSOSN padrão não configurado.")
    if not itens:
        raise EmissaoNFeError("Venda sem itens para emissão.")
    if any(not produto.ncm for _, produto in itens):
        raise EmissaoNFeError("Todos os produtos da venda precisam de NCM.")
    if not settings.NFE_CERTIFICATE_PATH or not settings.NFE_CERTIFICATE_PASSWORD:
        raise EmissaoNFeError("Certificado A1 não configurado no backend.")

    numero = int(empresa.numero_nfe or 1)
    serie = int(empresa.serie_nfe or 1)
    chave = _chave_nfe(empresa, venda, numero, serie)

    from pynfe.utils import etree

    raiz = etree.Element("NFe", xmlns=NFE_NAMESPACE)
    inf = etree.SubElement(raiz, "infNFe", versao="4.00", Id=f"NFe{chave}")
    ide = etree.SubElement(inf, "ide")
    for tag, valor in (
        ("cUF", chave[:2]), ("cNF", chave[-9:-1]), ("natOp", "VENDA DE MERCADORIA"),
        ("mod", "55"), ("serie", serie), ("nNF", numero), ("dhEmi", datetime.now().astimezone().isoformat(timespec="seconds")),
        ("tpNF", "1"), ("idDest", "1"), ("cMunFG", empresa.codigo_municipio_ibge),
        ("tpImp", "1"), ("tpEmis", "1"), ("cDV", chave[-1]), ("tpAmb", "2"),
        ("finNFe", "1"), ("indFinal", "1"), ("indPres", "1"), ("procEmi", "0"), ("verProc", "OrderFlow"),
    ):
        _configurar_elemento(ide, tag, valor)

    emit = etree.SubElement(inf, "emit")
    for tag, valor in (("CNPJ", _numeros(empresa.cnpj)), ("xNome", empresa.nome), ("xFant", empresa.nome)):
        _configurar_elemento(emit, tag, valor)
    endereco = etree.SubElement(emit, "enderEmit")
    for tag, valor in (("xLgr", empresa.endereco), ("nro", empresa.numero), ("xBairro", empresa.bairro), ("cMun", empresa.codigo_municipio_ibge), ("xMun", empresa.cidade), ("UF", empresa.estado.upper()), ("CEP", _numeros(empresa.cep)), ("cPais", empresa.codigo_pais), ("xPais", "BRASIL")):
        _configurar_elemento(endereco, tag, valor)
    _configurar_elemento(emit, "IE", _numeros(empresa.inscricao_estadual))
    _configurar_elemento(emit, "CRT", "1" if empresa.regime_tributario == "simples_nacional" else "3")

    total_produtos = Decimal("0")
    for indice, (item, produto) in enumerate(itens, start=1):
        quantidade = _decimal(item.quantidade)
        unitario = _decimal(item.valor_unitario)
        total_item = (quantidade * unitario).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_produtos += total_item
        det = etree.SubElement(inf, "det", nItem=str(indice))
        prod = etree.SubElement(det, "prod")
        cfop = produto.cfop or empresa.cfop_dentro_estado
        for tag, valor in (("cProd", produto.codigo_interno), ("xProd", produto.descricao), ("NCM", produto.ncm), ("CFOP", cfop), ("uCom", produto.unidade_medida), ("qCom", quantidade), ("vUnCom", unitario), ("vProd", total_item), ("uTrib", produto.unidade_medida), ("qTrib", quantidade), ("vUnTrib", unitario), ("indTot", "1")):
            _configurar_elemento(prod, tag, valor)
        imposto = etree.SubElement(det, "imposto")
        icms = etree.SubElement(imposto, "ICMS")
        icms_simples = etree.SubElement(icms, "ICMSSN102")
        _configurar_elemento(icms_simples, "orig", "0")
        _configurar_elemento(icms_simples, "CSOSN", produto.csosn or empresa.csosn_padrao)
        pis = etree.SubElement(imposto, "PIS")
        _configurar_elemento(etree.SubElement(pis, "PISNT"), "CST", "07")
        cofins = etree.SubElement(imposto, "COFINS")
        _configurar_elemento(etree.SubElement(cofins, "COFINSNT"), "CST", "07")

    total = etree.SubElement(inf, "total")
    icms_total = etree.SubElement(total, "ICMSTot")
    for tag, valor in (("vBC", "0.00"), ("vICMS", "0.00"), ("vICMSDeson", "0.00"), ("vFCP", "0.00"), ("vBCST", "0.00"), ("vST", "0.00"), ("vFCPST", "0.00"), ("vFCPSTRet", "0.00"), ("vProd", total_produtos), ("vFrete", _decimal(venda.valor_frete)), ("vSeg", "0.00"), ("vDesc", "0.00"), ("vII", "0.00"), ("vIPI", "0.00"), ("vIPIDevol", "0.00"), ("vPIS", "0.00"), ("vCOFINS", "0.00"), ("vOutro", "0.00"), ("vNF", _decimal(venda.valor_total))):
        _configurar_elemento(icms_total, tag, valor)

    transp = etree.SubElement(inf, "transp")
    _configurar_elemento(transp, "modFrete", "9")
    pag = etree.SubElement(inf, "pag")
    det_pag = etree.SubElement(pag, "detPag")
    _configurar_elemento(det_pag, "tPag", "99")
    _configurar_elemento(det_pag, "vPag", _decimal(venda.valor_total))
    return raiz, chave, numero, serie


def emitir_nfe(venda: Venda, empresa: Empresa, itens: list[tuple[ItemVenda, Produto]]) -> dict[str, Any]:
    raiz, chave, numero, serie = montar_xml_nfe(venda, empresa, itens)
    from pynfe.processamento.assinatura import AssinaturaA1
    from pynfe.processamento.comunicacao import ComunicacaoSefaz
    from pynfe.utils import etree

    assinado = AssinaturaA1(settings.NFE_CERTIFICATE_PATH, settings.NFE_CERTIFICATE_PASSWORD).assinar(raiz)
    comunicacao = ComunicacaoSefaz("RJ", settings.NFE_CERTIFICATE_PATH, settings.NFE_CERTIFICATE_PASSWORD, homologacao=True)
    resultado, resposta, *_ = comunicacao.autorizacao(55, assinado, id_lote=venda.id, ind_sinc=1)
    if resultado == 0:
        xml_autorizado = etree.tostring(resposta, encoding="unicode", pretty_print=False)
        return {"status": "autorizada", "chave_acesso": chave, "numero": numero, "serie": serie, "xml_assinado": etree.tostring(assinado, encoding="unicode"), "xml_autorizado": xml_autorizado, "protocolo": resposta.find("{http://www.portalfiscal.inf.br/nfe}protNFe/{http://www.portalfiscal.inf.br/nfe}infProt/{http://www.portalfiscal.inf.br/nfe}nProt").text if resposta.find("{http://www.portalfiscal.inf.br/nfe}protNFe/{http://www.portalfiscal.inf.br/nfe}infProt/{http://www.portalfiscal.inf.br/nfe}nProt") is not None else None}

    mensagem = getattr(resposta, "text", None) or "NF-e rejeitada pela SEFAZ."
    return {"status": "rejeitada", "chave_acesso": chave, "numero": numero, "serie": serie, "xml_assinado": etree.tostring(assinado, encoding="unicode"), "mensagem_status": mensagem}
