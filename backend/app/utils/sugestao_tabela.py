"""Serviço de análise e sugestão de Tabela de Preço a partir de notas/pedidos.

Fluxo:
1. Extrai texto de um arquivo (PDF/imagem, via OCR) e/ou de texto colado pelo usuário.
2. Faz parsing heurístico do texto para extrair itens (nome, quantidade, unidade, preço unitário).
3. Faz fuzzy matching de cada item extraído com os produtos cadastrados.
4. Simula o preço de cada item em cada Tabela de Preço ativa (exceção do produto > margem geral).
5. Escolhe a tabela com menor variação percentual média (MAPE) em relação aos preços da nota.
"""
import os
import re
import tempfile
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import Produto, TabelaPreco, TabelaPrecoItem

_REGEX_PRECO = re.compile(r'(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}|\d+,\d{2})', re.IGNORECASE)
_REGEX_QUANTIDADE = re.compile(
    r'^\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|lt|un|und|unidade|unidades|cx|caixa|pct|pacote)?s?\.?\s*x?\s*',
    re.IGNORECASE
)
_REGEX_UNIDADE_NA_DESCRICAO = re.compile(
    r'\b\d+(?:[.,]\d+)?\s*(kg|g|l|lt|un|und|unidade|unidades|cx|caixa|pct|pacote)\b',
    re.IGNORECASE
)
_LIMIAR_SIMILARIDADE = 0.45


def _parse_valor_monetario(valor_str: str) -> float:
    valor_str = valor_str.strip()
    if ',' in valor_str and '.' in valor_str:
        valor_str = valor_str.replace('.', '').replace(',', '.')
    elif ',' in valor_str:
        valor_str = valor_str.replace(',', '.')
    return float(valor_str)


def extrair_itens_de_texto(texto: str) -> List[Dict[str, Any]]:
    """Extrai itens {nome_produto, quantidade, unidade, preco_unitario_nota} de um texto livre"""
    itens: List[Dict[str, Any]] = []

    for linha_bruta in texto.splitlines():
        linha = linha_bruta.strip()
        if not linha:
            continue

        matches = list(_REGEX_PRECO.finditer(linha))
        if not matches:
            continue

        ultimo_match = matches[-1]
        try:
            preco = _parse_valor_monetario(ultimo_match.group(1))
        except ValueError:
            continue

        if preco <= 0:
            continue

        restante = (linha[:ultimo_match.start()] + linha[ultimo_match.end():])
        restante = re.sub(r'r\$', '', restante, flags=re.IGNORECASE)
        restante = restante.strip(' -–—.:xX*')

        quantidade = 1.0
        unidade = "UN"
        qtd_match = _REGEX_QUANTIDADE.match(restante)
        if qtd_match:
            try:
                quantidade = float(qtd_match.group(1).replace(',', '.'))
            except ValueError:
                quantidade = 1.0
            if qtd_match.group(2):
                unidade = qtd_match.group(2).upper()[:2]
            restante = restante[qtd_match.end():]

        nome_produto = restante.strip(' -–—.:')
        if not nome_produto:
            continue

        itens.append({
            "nome_produto": nome_produto,
            "quantidade": quantidade,
            "unidade": unidade,
            "preco_unitario_nota": preco,
        })

    return itens


def extrair_texto_de_arquivo(conteudo: bytes, content_type: str, filename: str) -> str:
    """Extrai texto de um PDF ou imagem enviado via upload, usando OCR"""
    try:
        from app.utils.ocr_processor import OCRProcessor
    except ImportError as e:
        raise ValueError(
            "O processamento de OCR não está disponível neste ambiente (dependências ausentes). "
            "Cole o texto do pedido/nota manualmente."
        ) from e

    processor = OCRProcessor()
    sufixo = Path(filename or "").suffix.lower()
    if not sufixo:
        sufixo = ".pdf" if "pdf" in (content_type or "").lower() else ".png"

    with tempfile.NamedTemporaryFile(suffix=sufixo, delete=False) as tmp:
        tmp.write(conteudo)
        caminho_temp = tmp.name

    try:
        if sufixo == ".pdf" or "pdf" in (content_type or "").lower():
            texto = processor.processar_pdf(caminho_temp)
        else:
            texto = processor.processar_imagem(caminho_temp)
    finally:
        try:
            os.remove(caminho_temp)
        except OSError:
            pass

    if not texto or not texto.strip():
        raise ValueError(
            "Não foi possível extrair texto do arquivo enviado. Tente colar o texto manualmente."
        )

    return texto


def _normalizar(texto: str) -> str:
    texto = (texto or "").lower().strip()
    texto = unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode('ascii')
    texto = _REGEX_UNIDADE_NA_DESCRICAO.sub(' ', texto)
    texto = re.sub(r'[^a-z0-9\s]', ' ', texto)
    texto = re.sub(r'\s+', ' ', texto).strip()
    return texto


def encontrar_produto_correspondente(nome_item: str, produtos: List[Produto]) -> Optional[Produto]:
    """Faz fuzzy matching do nome extraído da nota com os produtos cadastrados"""
    alvo = _normalizar(nome_item)
    if not alvo:
        return None

    melhor_produto: Optional[Produto] = None
    melhor_ratio = 0.0

    for produto in produtos:
        candidato = _normalizar(produto.descricao)
        if not candidato:
            continue

        ratio = SequenceMatcher(None, alvo, candidato).ratio()
        if alvo in candidato or candidato in alvo:
            ratio = max(ratio, 0.75)
        if produto.codigo_interno and produto.codigo_interno.lower() in nome_item.lower():
            ratio = max(ratio, 0.9)

        if ratio > melhor_ratio:
            melhor_ratio = ratio
            melhor_produto = produto

    return melhor_produto if melhor_ratio >= _LIMIAR_SIMILARIDADE else None


def calcular_preco_tabela(
    produto: Produto,
    tabela: TabelaPreco,
    itens_por_tabela: Dict[int, List[TabelaPrecoItem]]
) -> float:
    """Calcula o preço de um produto em uma tabela: exceção do produto > margem geral da tabela"""
    custo = float(produto.preco_custo)
    excecao = next(
        (i for i in itens_por_tabela.get(tabela.id, []) if i.produto_id == produto.id),
        None
    )
    margem = float(excecao.margem_especifica_percentual) if excecao else float(tabela.margem_geral_percentual)
    return round(custo * (1 + margem / 100), 2)


def gerar_sugestao_tabela(
    db: Session,
    texto_colado: Optional[str],
    texto_arquivo: Optional[str]
) -> Dict[str, Any]:
    """Analisa o texto/arquivo informado e sugere a tabela de preço com menor divergência"""
    texto_completo = "\n".join(filter(None, [texto_arquivo, texto_colado]))
    if not texto_completo.strip():
        raise ValueError("Informe um arquivo ou cole o texto do pedido/nota para análise")

    itens_extraidos = extrair_itens_de_texto(texto_completo)
    if not itens_extraidos:
        raise ValueError("Não foi possível identificar itens com preços no conteúdo informado")

    produtos = db.query(Produto).all()
    tabelas = db.query(TabelaPreco).filter(TabelaPreco.ativa.is_(True)).all()
    if not tabelas:
        raise ValueError("Não há tabelas de preço ativas cadastradas para comparação")

    todos_itens_tabela = db.query(TabelaPrecoItem).filter(
        TabelaPrecoItem.tabela_preco_id.in_([t.id for t in tabelas])
    ).all()
    itens_por_tabela: Dict[int, List[TabelaPrecoItem]] = {}
    for item in todos_itens_tabela:
        itens_por_tabela.setdefault(item.tabela_preco_id, []).append(item)

    comparativo: List[Dict[str, Any]] = []
    erros_por_tabela: Dict[int, List[float]] = {tabela.id: [] for tabela in tabelas}

    for item_extraido in itens_extraidos:
        produto = encontrar_produto_correspondente(item_extraido["nome_produto"], produtos)
        precos_por_tabela: Dict[str, Optional[float]] = {}

        for tabela in tabelas:
            if not produto:
                precos_por_tabela[str(tabela.id)] = None
                continue

            preco_calculado = calcular_preco_tabela(produto, tabela, itens_por_tabela)
            precos_por_tabela[str(tabela.id)] = preco_calculado

            preco_nota = item_extraido["preco_unitario_nota"]
            if preco_nota > 0:
                erros_por_tabela[tabela.id].append(abs(preco_calculado - preco_nota) / preco_nota)

        comparativo.append({
            "item_reconhecido": item_extraido["nome_produto"],
            "quantidade": item_extraido["quantidade"],
            "unidade": item_extraido["unidade"],
            "preco_nota": item_extraido["preco_unitario_nota"],
            "produto_id": produto.id if produto else None,
            "produto_descricao": produto.descricao if produto else None,
            "precos_por_tabela": precos_por_tabela,
        })

    tabelas_analisadas = []
    for tabela in tabelas:
        erros = erros_por_tabela.get(tabela.id, [])
        erro_percentual = (sum(erros) / len(erros) * 100) if erros else None
        tabelas_analisadas.append({
            "id": tabela.id,
            "nome": tabela.nome,
            "erro_percentual": round(erro_percentual, 2) if erro_percentual is not None else None,
            "itens_comparados": len(erros),
        })

    candidatas = [t for t in tabelas_analisadas if t["erro_percentual"] is not None]
    if not candidatas:
        raise ValueError(
            "Não foi possível identificar produtos correspondentes cadastrados no sistema "
            "para comparar as tabelas de preço"
        )

    melhor = min(candidatas, key=lambda t: t["erro_percentual"])
    tabela_sugerida = next(t for t in tabelas if t.id == melhor["id"])

    for item in comparativo:
        preco_sugerido = item["precos_por_tabela"].get(str(tabela_sugerida.id))
        if preco_sugerido is not None and item["preco_nota"]:
            diferenca_valor = round(preco_sugerido - item["preco_nota"], 2)
            diferenca_percentual = round((diferenca_valor / item["preco_nota"]) * 100, 2)
        else:
            diferenca_valor = None
            diferenca_percentual = None
        item["diferenca_valor"] = diferenca_valor
        item["diferenca_percentual"] = diferenca_percentual

    total_itens = len(itens_extraidos)
    itens_reconhecidos = sum(1 for c in comparativo if c["produto_id"])
    motivo = (
        f"A tabela '{tabela_sugerida.nome}' apresentou a menor variação percentual média "
        f"({melhor['erro_percentual']:.1f}%) em relação aos preços informados, considerando "
        f"{melhor['itens_comparados']} produto(s) reconhecido(s) de {total_itens} item(ns) "
        f"identificado(s) no conteúdo analisado, entre {len(tabelas)} tabela(s) ativa(s) comparada(s)."
    )
    if itens_reconhecidos < total_itens:
        motivo += f" {total_itens - itens_reconhecidos} item(ns) não foram reconhecidos no catálogo de produtos."

    return {
        "tabela_sugerida": {"id": tabela_sugerida.id, "nome": tabela_sugerida.nome},
        "motivo": motivo,
        "tabelas_analisadas": tabelas_analisadas,
        "comparativo": comparativo,
    }
