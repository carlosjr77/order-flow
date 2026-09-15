from __future__ import annotations

import base64
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
import os
import re
import tempfile
from typing import Any

from app.core.config import settings
from app.models import Cliente, Empresa, ItemVenda, Produto, Venda

NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe"


class EmissaoNFeError(ValueError):
    pass


def _numeros(valor: str | None) -> str:
    return re.sub(r"\D", "", valor or "")


def _decimal(valor: Any) -> Decimal:
    return Decimal(str(valor or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _texto(valor: Any) -> str:
    return "" if valor is None else str(valor)


def _texto_fiscal(valor: Any, limite: int) -> str:
    """Normaliza texto livre para os campos de texto do XML fiscal."""
    texto = "" if valor is None else str(valor)
    texto = " ".join(texto.split())
    texto = "".join(caractere for caractere in texto if caractere.isprintable())
    return texto[:limite]


def _preparar_certificado_a1() -> tuple[str, str | None]:
    """Aceita certificado PKCS#12 binário ou Base64 em secret file do Render."""
    caminho = settings.NFE_CERTIFICATE_PATH
    try:
        conteudo = open(caminho, "rb").read()
    except OSError as exc:
        raise EmissaoNFeError("Não foi possível ler o certificado A1 no backend.") from exc

    if conteudo.startswith(b"0"):
        return caminho, None

    try:
        decodificado = base64.b64decode(b"".join(conteudo.split()), validate=True)
    except Exception as exc:
        raise EmissaoNFeError("O arquivo do certificado A1 não é um PKCS#12 binário nem um Base64 válido.") from exc

    if not decodificado:
        raise EmissaoNFeError("O arquivo do certificado A1 está vazio.")

    temporario = tempfile.NamedTemporaryFile(prefix="nfe-certificate-", suffix=".pfx", delete=False)
    try:
        temporario.write(decodificado)
        temporario.close()
    except Exception:
        temporario.close()
        os.unlink(temporario.name)
        raise
    return temporario.name, temporario.name


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


def montar_xml_nfe(venda: Venda, empresa: Empresa, cliente: Cliente | None, itens: list[tuple[ItemVenda, Produto]], ambiente: str = "homologacao") -> tuple[Any, str, int, int]:
    if not empresa.inscricao_estadual:
        raise EmissaoNFeError("Inscrição Estadual da empresa não configurada.")
    if not empresa.codigo_municipio_ibge:
        raise EmissaoNFeError("Código IBGE do município da empresa não configurado.")
    if not empresa.cfop_dentro_estado or not empresa.cfop_fora_estado:
        raise EmissaoNFeError("CFOP dentro e fora do estado devem ser configurados.")
    if not empresa.csosn_padrao:
        raise EmissaoNFeError("CSOSN padrão não configurado.")
    if not cliente or not cliente.documento:
        raise EmissaoNFeError("A venda precisa de um cliente com CPF ou CNPJ para emissão da NF-e.")
    if not all((cliente.endereco, cliente.numero, cliente.bairro, cliente.cidade, cliente.estado, cliente.cep)):
        raise EmissaoNFeError("O endereço completo do cliente é obrigatório para emissão da NF-e.")
    if not itens:
        raise EmissaoNFeError("Venda sem itens para emissão.")
    if any(not produto.ncm for _, produto in itens):
        raise EmissaoNFeError("Todos os produtos da venda precisam de NCM.")
    if not settings.NFE_CERTIFICATE_PATH or not settings.NFE_CERTIFICATE_PASSWORD:
        raise EmissaoNFeError("Certificado A1 não configurado no backend.")
    if not os.path.isfile(settings.NFE_CERTIFICATE_PATH):
        raise EmissaoNFeError(
            f"Certificado A1 não encontrado em '{settings.NFE_CERTIFICATE_PATH}'."
        )

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
    for tag, valor in (("xLgr", _texto_fiscal(empresa.endereco, 60)), ("nro", _texto_fiscal(empresa.numero, 60)), ("xBairro", _texto_fiscal(empresa.bairro, 60)), ("cMun", empresa.codigo_municipio_ibge), ("xMun", _texto_fiscal(empresa.cidade, 60)), ("UF", empresa.estado.upper()), ("CEP", _numeros(empresa.cep)), ("cPais", empresa.codigo_pais), ("xPais", "BRASIL")):
        _configurar_elemento(endereco, tag, valor)
    _configurar_elemento(emit, "IE", _numeros(empresa.inscricao_estadual))
    _configurar_elemento(emit, "CRT", "1" if empresa.regime_tributario == "simples_nacional" else "3")

    dest = etree.SubElement(inf, "dest")
    documento = _numeros(cliente.documento)
    tag_documento = "CNPJ" if len(documento) == 14 else "CPF" if len(documento) == 11 else None
    if not tag_documento:
        raise EmissaoNFeError("O CPF/CNPJ do cliente é inválido.")
    _configurar_elemento(dest, tag_documento, documento)
    nome_destinatario = cliente.nome
    if ambiente == "homologacao":
        nome_destinatario = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
    _configurar_elemento(dest, "xNome", nome_destinatario)
    endereco_dest = etree.SubElement(dest, "enderDest")
    codigo_municipio_destino = getattr(cliente, "codigo_municipio_ibge", None) or empresa.codigo_municipio_ibge
    for tag, valor in (("xLgr", _texto_fiscal(cliente.endereco, 60)), ("nro", _texto_fiscal(cliente.numero, 60)), ("xBairro", _texto_fiscal(cliente.bairro, 60)), ("cMun", codigo_municipio_destino), ("xMun", _texto_fiscal(cliente.cidade, 60)), ("UF", cliente.estado.upper()), ("CEP", _numeros(cliente.cep)), ("cPais", empresa.codigo_pais), ("xPais", "BRASIL")):
        _configurar_elemento(endereco_dest, tag, valor)
    _configurar_elemento(dest, "indIEDest", "9")
    if cliente.email:
        _configurar_elemento(dest, "email", cliente.email)

    total_produtos = Decimal("0")
    for indice, (item, produto) in enumerate(itens, start=1):
        quantidade = _decimal(item.quantidade)
        unitario = _decimal(item.valor_unitario)
        total_item = (quantidade * unitario).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_produtos += total_item
        det = etree.SubElement(inf, "det", nItem=str(indice))
        prod = etree.SubElement(det, "prod")
        cfop = produto.cfop or empresa.cfop_dentro_estado
        for tag, valor in (("cProd", produto.codigo_interno), ("cEAN", "SEM GTIN"), ("xProd", produto.descricao), ("NCM", produto.ncm), ("CFOP", cfop), ("uCom", produto.unidade_medida), ("qCom", quantidade), ("vUnCom", unitario), ("vProd", total_item), ("cEANTrib", "SEM GTIN"), ("uTrib", produto.unidade_medida), ("qTrib", quantidade), ("vUnTrib", unitario), ("indTot", "1")):
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
    _configurar_elemento(det_pag, "xPag", "Pagamento conforme venda registrada no sistema")
    _configurar_elemento(det_pag, "vPag", _decimal(venda.valor_total))
    return raiz, chave, numero, serie


def emitir_nfe(venda: Venda, empresa: Empresa, cliente: Cliente | None, itens: list[tuple[ItemVenda, Produto]]) -> dict[str, Any]:
    ambiente_transmissao = "homologacao"
    raiz, chave, numero, serie = montar_xml_nfe(venda, empresa, cliente, itens, ambiente_transmissao)
    from pynfe.processamento.assinatura import AssinaturaA1
    from pynfe.processamento.comunicacao import ComunicacaoSefaz
    from pynfe.utils import etree

    caminho_certificado, temporario = _preparar_certificado_a1()
    try:
        try:
            assinado = AssinaturaA1(caminho_certificado, settings.NFE_CERTIFICATE_PASSWORD).assinar(raiz)
        except Exception as exc:
            mensagem = str(exc)
            if "senha" in mensagem.lower() or "password" in mensagem.lower() or "pkcs12" in mensagem.lower():
                raise EmissaoNFeError("A senha do certificado A1 está incorreta ou o arquivo não é um PKCS#12 válido.") from exc
            raise EmissaoNFeError("Não foi possível assinar o XML da NF-e com o certificado A1.") from exc
        comunicacao = ComunicacaoSefaz("RJ", caminho_certificado, settings.NFE_CERTIFICATE_PASSWORD, homologacao=True)
        resultado, resposta, *_ = comunicacao.autorizacao("nfe", assinado, id_lote=venda.id, ind_sinc=1)
    finally:
        if temporario:
            try:
                os.unlink(temporario)
            except OSError:
                pass
    if resultado == 0:
        xml_autorizado = etree.tostring(resposta, encoding="unicode", pretty_print=False)
        return {"status": "autorizada", "chave_acesso": chave, "numero": numero, "serie": serie, "xml_assinado": etree.tostring(assinado, encoding="unicode"), "xml_autorizado": xml_autorizado, "protocolo": resposta.find("{http://www.portalfiscal.inf.br/nfe}protNFe/{http://www.portalfiscal.inf.br/nfe}infProt/{http://www.portalfiscal.inf.br/nfe}nProt").text if resposta.find("{http://www.portalfiscal.inf.br/nfe}protNFe/{http://www.portalfiscal.inf.br/nfe}infProt/{http://www.portalfiscal.inf.br/nfe}nProt") is not None else None}

    resposta_xml = resposta
    if not hasattr(resposta, "xpath"):
        conteudo_resposta = getattr(resposta, "content", b"") or getattr(resposta, "text", "")
        try:
            resposta_xml = etree.fromstring(conteudo_resposta)
        except Exception:
            resposta_xml = None
    status_nodes = resposta_xml.xpath("//*[local-name()='cStat']") if resposta_xml is not None else []
    motivo_nodes = resposta_xml.xpath("//*[local-name()='xMotivo']") if resposta_xml is not None else []
    codigo_status = status_nodes[-1].text if status_nodes else None
    motivo = motivo_nodes[-1].text if motivo_nodes else "NF-e rejeitada pela SEFAZ."
    return {"status": "rejeitada", "codigo_status": codigo_status, "chave_acesso": chave, "numero": numero, "serie": serie, "xml_assinado": etree.tostring(assinado, encoding="unicode"), "mensagem_status": f"{codigo_status or 'SEFAZ'}: {motivo}"}
