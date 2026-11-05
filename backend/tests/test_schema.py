from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from app.core.database import engine
from app.models import Recebimento, RecebimentoAlocacao


def test_tabelas_e_coluna_existem():
    inspetor = inspect(engine)
    assert inspetor.has_table("recebimentos")
    assert inspetor.has_table("recebimento_alocacoes")
    assert "cliente_id" in {coluna["name"] for coluna in inspetor.get_columns("vendas")}


def test_valor_nao_positivo_viola_check(db):
    db.add(Recebimento(
        data_pagamento=date(2026, 11, 1),
        forma_pagamento="PIX",
        valor_total=Decimal("0"),
        origem="avulso",
    ))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_alocacao_nao_positiva_viola_check(db, criar_venda):
    venda = criar_venda()
    recebimento = Recebimento(
        data_pagamento=date(2026, 11, 1),
        forma_pagamento="PIX",
        valor_total=Decimal("10"),
        origem="avulso",
    )
    db.add(recebimento)
    db.commit()
    db.add(RecebimentoAlocacao(recebimento_id=recebimento.id, venda_id=venda.id, valor=Decimal("-1")))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
