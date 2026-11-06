"""Busca de texto parcial ("contém"), sem diferença de maiúsculas e acentos.

Usa translate() em vez da extensão unaccent, que exige permissão para CREATE EXTENSION no banco.
"""
import re
from typing import Optional

from sqlalchemy import String, case, func, literal

_ACENTOS = "áàãâäéèêëíìîïóòõôöúùûüçñ"
_SEM_ACENTOS = "aaaaaeeeeiiiiooooouuuucn"
MINIMO_DIGITOS_DOCUMENTO = 3


def sem_acento(expressao):
    """Expressão SQL em minúsculas e sem acentos."""
    return func.translate(func.lower(expressao), _ACENTOS, _SEM_ACENTOS)


def _escapar_like(termo: str) -> str:
    """Faz `%`, `_` e `\\` digitados contarem como texto, não como curinga."""
    return termo.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _termo_normalizado(termo: str) -> str:
    return " ".join(termo.split())


def contem(coluna, termo: str):
    """`coluna` contém `termo`, ignorando maiúsculas, acentos e espaços repetidos no termo."""
    padrao = sem_acento(literal(f"%{_escapar_like(_termo_normalizado(termo))}%", String))
    return sem_acento(coluna).like(padrao, escape="\\")


def comeca_com(coluna, termo: str):
    padrao = sem_acento(literal(f"{_escapar_like(_termo_normalizado(termo))}%", String))
    return sem_acento(coluna).like(padrao, escape="\\")


def documento_contem(coluna, termo: str) -> Optional[object]:
    """CPF/CNPJ contém os dígitos do termo, com ou sem máscara.

    Só quando o termo parece um documento (números, pontos, barra e traço) e tem ao menos 3 dígitos,
    para "Loja 2" ou "Café 100%" buscarem só no nome.
    """
    if not re.fullmatch(r"[\d.\-/\s]+", termo.strip()):
        return None
    digitos = re.sub(r"\D", "", termo)
    if len(digitos) < MINIMO_DIGITOS_DOCUMENTO:
        return None
    return func.regexp_replace(coluna, r"\D", "", "g").like(f"%{digitos}%")


def ordem_relevancia(coluna, termo: str):
    """Nomes que começam com o termo vêm antes dos que só o contêm."""
    return case((comeca_com(coluna, termo), 0), else_=1)
