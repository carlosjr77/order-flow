from decimal import Decimal

from app.core.database import engine
from app.models import Recebimento, Venda
from app.utils.financeiro_migracao import OBSERVACAO_MIGRACAO, migrar_dados_financeiros, normalizar_nome
from app.utils import financeiro as fin


def test_normalizar_nome():
    assert normalizar_nome("  JOÃO   da  Silva ") == "joao da silva"


def test_vinculo_com_nome_unico_ignora_acento_e_caixa(db, criar_cliente, criar_venda):
    cliente = criar_cliente(nome="João da Silva")
    venda = criar_venda(nome_cliente="JOAO  DA SILVA")

    migrar_dados_financeiros(engine)

    db.expire_all()
    assert db.get(Venda, venda.id).cliente_id == cliente.id


def test_nome_ambiguo_ou_ausente_fica_sem_vinculo(db, criar_cliente, criar_venda):
    criar_cliente(nome="Maria", documento="1")
    criar_cliente(nome="MARIA", documento="2")
    ambigua = criar_venda(nome_cliente="Maria")
    ausente = criar_venda(nome_cliente="Sem Cadastro")

    migrar_dados_financeiros(engine)

    db.expire_all()
    assert db.get(Venda, ambigua.id).cliente_id is None
    assert db.get(Venda, ausente.id).cliente_id is None


def test_venda_concluida_vira_liquidada_e_pendente_fica_em_aberto(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    concluida = criar_venda("250.00", cliente, status="concluído")
    sem_acento = criar_venda("50.00", cliente, status="concluido")
    pendente = criar_venda("100.00", cliente)

    resultado = migrar_dados_financeiros(engine)

    assert resultado["recebimentos_criados"] == 2
    db.expire_all()
    pagos = fin.mapa_pagos(db, [concluida.id, sem_acento.id, pendente.id])
    assert pagos[concluida.id] == Decimal("250.00")
    assert pagos[sem_acento.id] == Decimal("50.00")
    assert pendente.id not in pagos
    historico = db.query(Recebimento).filter(Recebimento.valor_total == Decimal("250.00")).one()
    assert historico.origem == "migracao"
    assert historico.observacoes == OBSERVACAO_MIGRACAO
    assert historico.cliente_id == cliente.id
    assert historico.data_pagamento == db.get(Venda, concluida.id).data_venda.date()
    resumo = fin.extrato_cliente(db, cliente.id)["resumo"]
    assert resumo["saldo_liquido"] == Decimal("100.00")
    assert resumo["total_recebido_avulso"] == Decimal("0")


def test_cancelada_excluida_e_valor_zero_nao_geram_recebimento(db, criar_venda):
    criar_venda("10.00", status="cancelado")
    criar_venda("0.00", status="concluído")
    excluida = criar_venda("10.00", status="concluído")
    from datetime import datetime
    excluida.deleted_at = datetime(2026, 1, 1)
    db.commit()

    migrar_dados_financeiros(engine)

    assert db.query(Recebimento).count() == 0


def test_nova_execucao_nao_duplica(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    criar_venda("250.00", cliente, status="concluído")

    migrar_dados_financeiros(engine)
    resultado = migrar_dados_financeiros(engine)

    assert resultado == {"vendas_vinculadas": 0, "recebimentos_criados": 0}
    assert db.query(Recebimento).count() == 1


def test_venda_com_estorno_nao_recebe_novo_historico(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("250.00", cliente, status="concluído")
    migrar_dados_financeiros(engine)
    recebimento = db.query(Recebimento).one()
    fin.estornar(db, recebimento.id, "Na verdade não foi paga", usuario_id=None)
    db.commit()
    db.expire_all()
    assert db.get(Venda, venda.id).status == "pendente"

    migrar_dados_financeiros(engine)

    assert db.query(Recebimento).count() == 1
