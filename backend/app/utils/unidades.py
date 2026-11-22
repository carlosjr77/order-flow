"""Unidades de medida: todas as variações de escrita apontam para a sigla usada no cadastro."""
from typing import Optional

UNIDADES_ALIASES = {
    'kg': 'KG', 'kgs': 'KG', 'k': 'KG', 'kilo': 'KG', 'kilos': 'KG', 'quilo': 'KG', 'quilos': 'KG',
    'g': 'G', 'grama': 'G', 'gramas': 'G',
    'cx': 'CX', 'caixa': 'CX', 'caixas': 'CX',
    'sc': 'SC', 'saca': 'SC', 'sacas': 'SC', 'saco': 'SC', 'sacos': 'SC',
    'un': 'UN', 'und': 'UN', 'unid': 'UN', 'unidade': 'UN', 'unidades': 'UN',
    'bj': 'UN', 'bandeja': 'UN', 'bandejas': 'UN',
    'pct': 'PCT', 'pacote': 'PCT', 'pacotes': 'PCT',
    'lt': 'LT', 'l': 'LT', 'litro': 'LT', 'litros': 'LT',
}

NOMES_UNIDADES = {
    'KG': 'Quilo', 'G': 'Grama', 'CX': 'Caixa', 'SC': 'Saca', 'UN': 'Unidade', 'PCT': 'Pacote', 'LT': 'Litro',
}


def mapear_unidade(token: Optional[str]) -> Optional[str]:
    """Sigla canônica de uma unidade escrita de qualquer forma, ou None se for desconhecida."""
    if not token:
        return None
    return UNIDADES_ALIASES.get(token.strip(' .').lower())


def normalizar_unidade(token: Optional[str]) -> str:
    """Sigla canônica; unidade desconhecida volta em maiúsculas, vazia vira UN."""
    if not token or not token.strip():
        return 'UN'
    return mapear_unidade(token) or token.strip().upper()
