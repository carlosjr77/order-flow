"""Serviço de análise e sugestão de Tabela de Preço a partir de notas/pedidos.

Fluxo:
1. Extrai texto de um arquivo (PDF/imagem, via OCR) e/ou de texto colado pelo usuário.
2. Faz parsing heurístico do texto para extrair itens (nome, quantidade, unidade, preço unitário).
3. Faz fuzzy matching de cada item extraído com os produtos cadastrados, exigindo que a unidade
   de medida (KG, CX, UN, PCT, LT, ...) seja compatível - é proibido vincular um preço cotado em
   KG a um produto cadastrado em CX (e vice-versa). Itens com unidade divergente ficam sem preço
   calculado e recebem um aviso, sendo excluídos da métrica de comparação entre tabelas. O matching
   exige um score mínimo de confiança (0.80) e aplica duas barreiras semânticas: (a) categoria de
   hortifrúti incompatível (fruta x legume/verdura) nunca é associada; (b) a palavra-chave/raiz
   principal do item da nota precisa aparecer no nome do produto do sistema (ex: "Milho" não pode
   casar com "Pimentão" só por semelhança genérica). Abaixo do limiar, o item fica sem produto.
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

# Mapeia todas as variações de escrita para a unidade canônica usada no cadastro de produtos
_UNIDADES_ALIASES = {
    'kg': 'KG', 'kgs': 'KG', 'k': 'KG', 'kilo': 'KG', 'kilos': 'KG', 'quilo': 'KG', 'quilos': 'KG',
    'g': 'G', 'grama': 'G', 'gramas': 'G',
    'cx': 'CX', 'caixa': 'CX', 'caixas': 'CX',
    'un': 'UN', 'und': 'UN', 'unid': 'UN', 'unidade': 'UN', 'unidades': 'UN',
    'bj': 'UN', 'bandeja': 'UN', 'bandejas': 'UN', 'saco': 'UN', 'sacos': 'UN',
    'pct': 'PCT', 'pacote': 'PCT', 'pacotes': 'PCT',
    'lt': 'LT', 'l': 'LT', 'litro': 'LT', 'litros': 'LT',
}
# Ordenado por tamanho decrescente para casar termos compostos (ex: "kilo") antes de abreviações ("k")
_UNIDADE_TOKENS_ORDENADOS = sorted(_UNIDADES_ALIASES.keys(), key=len, reverse=True)
_ALTERNATIVAS_UNIDADE = '|'.join(_UNIDADE_TOKENS_ORDENADOS)

_REGEX_QTD_UNIDADE_INLINE = re.compile(
    r'(\d+(?:[.,]\d+)?)\s*(' + _ALTERNATIVAS_UNIDADE + r')\b\.?',
    re.IGNORECASE
)
_REGEX_UNIDADE_GERAL = re.compile(r'\b(' + _ALTERNATIVAS_UNIDADE + r')\b\.?', re.IGNORECASE)
_REGEX_MULTIPLICADOR = re.compile(r'^\s*(\d+(?:[.,]\d+)?)\s*x\s+', re.IGNORECASE)
_REGEX_UNIDADE_NA_DESCRICAO = re.compile(
    r'\b\d+(?:[.,]\d+)?\s*(' + _ALTERNATIVAS_UNIDADE + r')\b',
    re.IGNORECASE
)
_LIMIAR_SIMILARIDADE = 0.80

# Categorias de hortifrúti usadas como barreira semântica: nunca associar um item de uma
# categoria a um produto de categoria distinta (ex: legume/verdura nunca vira fruta)
_CATEGORIAS_HORTIFRUTI: Dict[str, str] = {
    # Legumes e verduras
    "vagem": "legume", "milho": "legume", "abobora": "legume", "abobrinha": "legume",
    "alface": "legume", "cenoura": "legume", "batata": "legume", "tomate": "legume",
    "cebola": "legume", "pimentao": "legume", "couve": "legume", "brocolis": "legume",
    "repolho": "legume", "chuchu": "legume", "pepino": "legume", "beterraba": "legume",
    "rabanete": "legume", "espinafre": "legume", "salsa": "legume", "cebolinha": "legume",
    "coentro": "legume", "quiabo": "legume", "berinjela": "legume", "mandioca": "legume",
    "aipim": "legume", "inhame": "legume", "ervilha": "legume", "rucula": "legume",
    # Frutas
    "morango": "fruta", "amora": "fruta", "uva": "fruta", "maca": "fruta", "banana": "fruta",
    "laranja": "fruta", "abacaxi": "fruta", "melancia": "fruta", "mamao": "fruta", "pera": "fruta",
    "pessego": "fruta", "manga": "fruta", "limao": "fruta", "tangerina": "fruta", "kiwi": "fruta",
    "goiaba": "fruta", "ameixa": "fruta", "caju": "fruta", "abacate": "fruta", "framboesa": "fruta",
    "mirtilo": "fruta", "melao": "fruta",
}

# Sinônimos/erros de grafia comuns no cadastro de produtos, normalizados para uma raiz em comum
_SINONIMOS_PRODUTO: Dict[str, str] = {
    "alfase": "alface",
    "abobrinha": "abobora",
}

_STOPWORDS_PALAVRA_PRINCIPAL = {"de", "do", "da", "das", "dos", "com", "sem", "e"}


def _mapear_unidade(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    return _UNIDADES_ALIASES.get(token.strip(' .').lower())


def _parse_valor_monetario(valor_str: str) -> float:
    valor_str = valor_str.strip()
    if ',' in valor_str and '.' in valor_str:
        valor_str = valor_str.replace('.', '').replace(',', '.')
    elif ',' in valor_str:
        valor_str = valor_str.replace(',', '.')
    return float(valor_str)


def extrair_itens_de_texto(texto: str) -> List[Dict[str, Any]]:
    """Extrai itens {nome_produto, quantidade, unidade, preco_unitario_nota} de um texto livre.

    A unidade de medida é extraída de forma obrigatória: pode vir colada à quantidade
    ("2kg", "2k"), separada em qualquer parte da linha ("... R$ 5,90 kilo") ou, na ausência
    de qualquer indício, assume-se "UN" como padrão.
    """
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

        antes_preco = re.sub(r'r\$', '', linha[:ultimo_match.start()], flags=re.IGNORECASE)
        depois_preco = re.sub(r'r\$', '', linha[ultimo_match.end():], flags=re.IGNORECASE)

        mult_match = _REGEX_MULTIPLICADOR.match(antes_preco)
        if mult_match:
            antes_preco = antes_preco[mult_match.end():]

        quantidade = 1.0
        unidade_token: Optional[str] = None

        qtd_match = _REGEX_QTD_UNIDADE_INLINE.search(antes_preco)
        if qtd_match:
            try:
                quantidade = float(qtd_match.group(1).replace(',', '.'))
            except ValueError:
                quantidade = 1.0
            unidade_token = qtd_match.group(2)
            nome_produto = antes_preco[:qtd_match.start()] + antes_preco[qtd_match.end():]
        else:
            nome_produto = antes_preco

        # Unidade mencionada isoladamente (sem quantidade colada), antes ou depois do preço
        if not unidade_token:
            unidade_match = _REGEX_UNIDADE_GERAL.search(antes_preco) or _REGEX_UNIDADE_GERAL.search(depois_preco)
            if unidade_match:
                unidade_token = unidade_match.group(1)
                nome_produto = _REGEX_UNIDADE_GERAL.sub(' ', nome_produto)

        nome_produto = nome_produto.strip(' -–—.:xX*')
        nome_produto = re.sub(r'\s+', ' ', nome_produto).strip()
        if not nome_produto:
            continue

        unidade = _mapear_unidade(unidade_token) or "UN"

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


def _normalizar_e_padronizar(texto: str) -> str:
    """Normaliza e aplica o mapeamento de sinônimos/variações de grafia conhecidas"""
    palavras = _normalizar(texto).split()
    return " ".join(_SINONIMOS_PRODUTO.get(palavra, palavra) for palavra in palavras)


def _categoria_de(texto_normalizado: str) -> Optional[str]:
    for palavra in texto_normalizado.split():
        categoria = _CATEGORIAS_HORTIFRUTI.get(palavra)
        if categoria:
            return categoria
    return None


def _palavra_principal(texto_normalizado: str) -> Optional[str]:
    """Retorna a palavra-chave/raiz principal do item (primeira palavra significativa)"""
    for palavra in texto_normalizado.split():
        if palavra not in _STOPWORDS_PALAVRA_PRINCIPAL and len(palavra) >= 3:
            return palavra
    return None


def encontrar_produto_correspondente(
    nome_item: str,
    unidade_item: str,
    produtos: List[Produto]
) -> tuple[Optional[Produto], Optional[Produto]]:
    """Faz fuzzy matching do nome extraído da nota com os produtos cadastrados, exigindo que a
    unidade de medida seja compatível (fator crítico) e aplicando duas barreiras semânticas:
    (a) categorias de hortifrúti incompatíveis (fruta x legume/verdura) nunca são associadas;
    (b) a palavra-chave/raiz principal do item precisa aparecer no nome do produto do sistema.
    Abaixo do score mínimo de confiança (0.80), o item não é associado a nenhum produto.

    Retorna uma tupla: (produto_compatível, produto_similar_com_unidade_divergente). Se houver um
    produto com nome semelhante porém cadastrado em outra unidade (ex: nota em KG e sistema em
    CX), o produto compatível é None e o segundo item da tupla traz esse produto apenas para fins
    de aviso ao usuário - ele NÃO deve ser usado no cálculo de preços.
    """
    alvo = _normalizar_e_padronizar(nome_item)
    if not alvo:
        return None, None

    categoria_alvo = _categoria_de(alvo)
    palavra_principal_alvo = _palavra_principal(alvo)

    candidatos: List[tuple[float, Produto]] = []
    for produto in produtos:
        candidato = _normalizar_e_padronizar(produto.descricao)
        if not candidato:
            continue

        # Barreira 1: categorias de hortifrúti incompatíveis nunca são associadas
        categoria_candidato = _categoria_de(candidato)
        if categoria_alvo and categoria_candidato and categoria_alvo != categoria_candidato:
            continue

        ratio = SequenceMatcher(None, alvo, candidato).ratio()
        if alvo in candidato or candidato in alvo:
            ratio = max(ratio, 0.9)
        if produto.codigo_interno and produto.codigo_interno.lower() in nome_item.lower():
            ratio = max(ratio, 0.95)

        # Barreira 2: a raiz/palavra-chave principal do item precisa aparecer no produto do
        # sistema (evita que uma palavra secundária compartilhada gere falso positivo)
        if palavra_principal_alvo and palavra_principal_alvo not in candidato and ratio < 0.95:
            continue

        if ratio >= _LIMIAR_SIMILARIDADE:
            candidatos.append((ratio, produto))

    if not candidatos:
        return None, None

    candidatos.sort(key=lambda c: c[0], reverse=True)

    unidade_normalizada_item = (unidade_item or "UN").upper()
    for _, produto in candidatos:
        if (produto.unidade_medida or "").upper() == unidade_normalizada_item:
            return produto, None

    # Existe produto com nome semelhante, mas nenhum na mesma unidade de medida
    return None, candidatos[0][1]


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
        produto, produto_unidade_divergente = encontrar_produto_correspondente(
            item_extraido["nome_produto"], item_extraido["unidade"], produtos
        )
        precos_por_tabela: Dict[str, Optional[float]] = {}
        aviso_unidade: Optional[str] = None

        for tabela in tabelas:
            if not produto:
                precos_por_tabela[str(tabela.id)] = None
                continue

            preco_calculado = calcular_preco_tabela(produto, tabela, itens_por_tabela)
            precos_por_tabela[str(tabela.id)] = preco_calculado

            preco_nota = item_extraido["preco_unitario_nota"]
            if preco_nota > 0:
                erros_por_tabela[tabela.id].append(abs(preco_calculado - preco_nota) / preco_nota)

        if not produto and produto_unidade_divergente:
            aviso_unidade = (
                f"Unidade incompatível: Nota em {item_extraido['unidade']} / "
                f"Sistema em {produto_unidade_divergente.unidade_medida}"
            )

        comparativo.append({
            "item_reconhecido": item_extraido["nome_produto"],
            "quantidade": item_extraido["quantidade"],
            "unidade": item_extraido["unidade"],
            "preco_nota": item_extraido["preco_unitario_nota"],
            "produto_id": produto.id if produto else None,
            "produto_descricao": produto.descricao if produto else None,
            "precos_por_tabela": precos_por_tabela,
            "aviso_unidade": aviso_unidade,
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
    itens_unidade_incompativel = sum(1 for c in comparativo if c.get("aviso_unidade"))
    motivo = (
        f"A tabela '{tabela_sugerida.nome}' apresentou a menor variação percentual média "
        f"({melhor['erro_percentual']:.1f}%) em relação aos preços informados, considerando "
        f"{melhor['itens_comparados']} produto(s) reconhecido(s) de {total_itens} item(ns) "
        f"identificado(s) no conteúdo analisado, entre {len(tabelas)} tabela(s) ativa(s) comparada(s)."
    )
    nao_reconhecidos = total_itens - itens_reconhecidos
    if nao_reconhecidos:
        motivo += f" {nao_reconhecidos} item(ns) não foram reconhecidos no catálogo de produtos."
    if itens_unidade_incompativel:
        motivo += (
            f" {itens_unidade_incompativel} item(ns) foram desconsiderados da comparação por "
            "divergência de unidade de medida entre a nota e o cadastro do sistema."
        )

    return {
        "tabela_sugerida": {"id": tabela_sugerida.id, "nome": tabela_sugerida.nome},
        "motivo": motivo,
        "tabelas_analisadas": tabelas_analisadas,
        "comparativo": comparativo,
    }
