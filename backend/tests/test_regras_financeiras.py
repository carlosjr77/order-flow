import threading
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.core.database import SessionLocal
from app.models import Recebimento, Venda
from app.utils import financeiro as fin

D = Decimal


def receber(db, cliente, valor, alocacoes=(), forma="PIX", data=date(2026, 11, 1)):
    recebimento = fin.registrar_recebimento(
        db,
        cliente_id=cliente.id,
        data_pagamento=data,
        forma_pagamento=forma,
        valor_total=D(valor),
        alocacoes=[(venda.id, D(v)) for venda, v in alocacoes],
    )
    db.commit()
    return recebimento


def recarregar(db, venda):
    db.expire_all()
    return db.get(Venda, venda.id)


def assert_invariante(db, cliente):
    resumo = fin.extrato_cliente(db, cliente.id)["resumo"]
    assert resumo["saldo_liquido"] == resumo["total_bruto"] - resumo["total_recebido"]


def test_exemplo_do_pedido_nota_parcial(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("1931.00", cliente)

    receber(db, cliente, "1500.00", [(venda, "1500.00")])

    pago = fin.mapa_pagos(db, [venda.id])[venda.id]
    assert pago == D("1500.00")
    assert venda.valor_total - pago == D("431.00")
    assert fin.status_financeiro(venda.valor_total, pago) == "parcial"
    assert recarregar(db, venda).status == "pendente"
    assert_invariante(db, cliente)


def test_recebimento_em_varias_notas_com_sobra_vira_credito(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    a = criar_venda("1000.00", cliente)
    b = criar_venda("1500.00", cliente)
    c = criar_venda("8031.00", cliente)

    receber(db, cliente, "3000.00", [(a, "1000.00"), (b, "1500.00"), (c, "100.00")])

    assert recarregar(db, a).status == "concluído"
    assert recarregar(db, b).status == "concluído"
    assert recarregar(db, c).status == "pendente"
    resumo = fin.extrato_cliente(db, cliente.id)["resumo"]
    assert resumo["total_bruto"] == D("10531.00")
    assert resumo["total_recebido"] == D("3000.00")
    assert resumo["credito_disponivel"] == D("400.00")
    assert resumo["total_em_aberto"] == D("7931.00")
    assert resumo["saldo_liquido"] == D("7531.00")


def test_credito_usado_depois(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("500.00", cliente)
    recebimento = receber(db, cliente, "500.00")
    assert fin.extrato_cliente(db, cliente.id)["resumo"]["credito_disponivel"] == D("500.00")

    fin.alocar(db, recebimento.id, [(venda.id, D("200.00"))])
    db.commit()
    fin.alocar(db, recebimento.id, [(venda.id, D("300.00"))])
    db.commit()

    assert fin.extrato_cliente(db, cliente.id)["resumo"]["credito_disponivel"] == D("0.00")
    assert recarregar(db, venda).status == "concluído"
    assert_invariante(db, cliente)


def test_recebimento_maior_que_divida_gera_saldo_a_favor(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    receber(db, cliente, "150.00", [(venda, "100.00")])

    resumo = fin.extrato_cliente(db, cliente.id)["resumo"]
    assert resumo["saldo_liquido"] == D("-50.00")
    assert_invariante(db, cliente)


@pytest.mark.parametrize("alocacoes", [
    [("100.01",)],
    [("60.00",), ("40.01",)],  # mesma venda repetida na lista
])
def test_alocacao_acima_do_saldo_nao_grava_nada(db, criar_cliente, criar_venda, alocacoes):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)

    with pytest.raises(HTTPException) as erro:
        fin.registrar_recebimento(
            db,
            cliente_id=cliente.id,
            data_pagamento=date(2026, 11, 1),
            forma_pagamento="PIX",
            valor_total=D("500.00"),
            alocacoes=[(venda.id, D(a[0])) for a in alocacoes],
        )
    assert erro.value.status_code == 409
    db.rollback()
    assert db.query(Recebimento).count() == 0


def test_alocacoes_acima_do_valor_recebido(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    with pytest.raises(HTTPException) as erro:
        receber(db, cliente, "50.00", [(venda, "60.00")])
    assert erro.value.status_code == 400


def test_venda_de_outro_cliente_e_rejeitada(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    outro = criar_cliente(nome="Outro", documento="1")
    venda = criar_venda("100.00", outro)
    with pytest.raises(HTTPException) as erro:
        receber(db, cliente, "50.00", [(venda, "50.00")])
    assert erro.value.status_code == 409


def test_venda_cancelada_e_rejeitada(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente, status="cancelado")
    with pytest.raises(HTTPException) as erro:
        receber(db, cliente, "50.00", [(venda, "50.00")])
    assert erro.value.status_code == 409


def test_data_futura_e_rejeitada(db, criar_cliente):
    cliente = criar_cliente()
    with pytest.raises(HTTPException) as erro:
        receber(db, cliente, "50.00", data=fin.hoje() + timedelta(days=1))
    assert erro.value.status_code == 400


def test_forma_desconhecida_e_rejeitada(db, criar_cliente):
    cliente = criar_cliente()
    with pytest.raises(HTTPException) as erro:
        receber(db, cliente, "50.00", forma="Cheque")
    assert erro.value.status_code == 400


def test_estorno_reabre_saldo_e_nao_repete(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    recebimento = receber(db, cliente, "100.00", [(venda, "100.00")])
    assert recarregar(db, venda).status == "concluído"

    fin.estornar(db, recebimento.id, "Lançado errado", usuario_id=None)
    db.commit()

    assert recarregar(db, venda).status == "pendente"
    assert fin.mapa_pagos(db, [venda.id]).get(venda.id, D("0")) == D("0")
    resumo = fin.extrato_cliente(db, cliente.id)["resumo"]
    assert resumo["total_recebido"] == D("0")
    assert_invariante(db, cliente)

    with pytest.raises(HTTPException) as erro:
        fin.estornar(db, recebimento.id, "De novo", usuario_id=None)
    assert erro.value.status_code == 409


def test_recebimento_estornado_nao_aceita_alocacao(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    recebimento = receber(db, cliente, "100.00")
    fin.estornar(db, recebimento.id, "Erro", usuario_id=None)
    db.commit()
    with pytest.raises(HTTPException) as erro:
        fin.alocar(db, recebimento.id, [(venda.id, D("10.00"))])
    assert erro.value.status_code == 409


def test_concluir_cria_recebimento_do_saldo(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("1931.00", cliente)
    receber(db, cliente, "1500.00", [(venda, "1500.00")])

    fin.concluir_venda(db, venda, usuario_id=None)
    db.commit()

    assert recarregar(db, venda).status == "concluído"
    automatico = db.query(Recebimento).filter(Recebimento.origem == "conclusao").one()
    assert automatico.valor_total == D("431.00")
    assert automatico.forma_pagamento == "PIX"
    assert automatico.cliente_id == cliente.id
    assert_invariante(db, cliente)


def test_concluir_venda_cancelada_e_rejeitado(db, criar_venda):
    venda = criar_venda("100.00", status="cancelado")
    with pytest.raises(HTTPException) as erro:
        fin.concluir_venda(db, venda, usuario_id=None)
    assert erro.value.status_code == 409


def test_cancelar_bloqueado_com_avulso(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    receber(db, cliente, "50.00", [(venda, "50.00")])
    with pytest.raises(HTTPException) as erro:
        fin.preparar_cancelamento(db, venda, usuario_id=None)
    assert erro.value.status_code == 409


def test_cancelar_estorna_automaticos(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    fin.concluir_venda(db, venda, usuario_id=None)
    db.commit()

    fin.preparar_cancelamento(db, venda, usuario_id=None)
    venda.status = "cancelado"
    db.commit()

    automatico = db.query(Recebimento).one()
    assert automatico.estornado_em is not None
    assert automatico.motivo_estorno
    assert_invariante(db, cliente)


def test_editar_abaixo_do_avulso_e_bloqueado(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    receber(db, cliente, "80.00", [(venda, "80.00")])
    venda = recarregar(db, venda)
    total_anterior = venda.valor_total
    venda.valor_total = D("79.99")
    with pytest.raises(HTTPException) as erro:
        fin.aplicar_edicao(db, venda, total_anterior, None, usuario_id=None)
    assert erro.value.status_code == 409


def test_editar_venda_concluida_automatica_refaz_recebimento(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    fin.concluir_venda(db, venda, usuario_id=None)
    db.commit()

    venda = recarregar(db, venda)
    total_anterior = venda.valor_total
    venda.valor_total = D("70.00")
    fin.aplicar_edicao(db, venda, total_anterior, None, usuario_id=None)
    db.commit()

    assert recarregar(db, venda).status == "concluído"
    ativos = db.query(Recebimento).filter(Recebimento.estornado_em.is_(None)).all()
    assert [r.valor_total for r in ativos] == [D("70.00")]
    assert_invariante(db, cliente)


def test_editar_venda_quitada_por_avulso_aumentando_total_reabre(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    receber(db, cliente, "100.00", [(venda, "100.00")])

    venda = recarregar(db, venda)
    total_anterior = venda.valor_total
    venda.valor_total = D("150.00")
    fin.aplicar_edicao(db, venda, total_anterior, None, usuario_id=None)
    db.commit()

    assert recarregar(db, venda).status == "pendente"
    assert_invariante(db, cliente)


def test_editar_pedindo_conclusao_quita_o_saldo(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    receber(db, cliente, "40.00", [(venda, "40.00")])

    venda = recarregar(db, venda)
    fin.aplicar_edicao(db, venda, venda.valor_total, "concluído", usuario_id=None)
    db.commit()

    assert recarregar(db, venda).status == "concluído"
    automatico = db.query(Recebimento).filter(Recebimento.origem == "conclusao").one()
    assert automatico.valor_total == D("60.00")


def test_vincular_propaga_para_automaticos(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", nome_cliente="Digitado")
    fin.concluir_venda(db, venda, usuario_id=None)
    db.commit()
    assert db.query(Recebimento).one().cliente_id is None

    fin.vincular_cliente(db, venda, cliente.id)
    db.commit()

    assert recarregar(db, venda).cliente_id == cliente.id
    db.expire_all()
    assert db.query(Recebimento).one().cliente_id == cliente.id
    assert recarregar(db, venda).nome_cliente == "Digitado"
    assert_invariante(db, cliente)


def test_vincular_bloqueado_com_avulso_de_outro_cliente(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    outro = criar_cliente(nome="Outro", documento="1")
    venda = criar_venda("100.00", cliente)
    receber(db, cliente, "50.00", [(venda, "50.00")])
    with pytest.raises(HTTPException) as erro:
        fin.vincular_cliente(db, venda, outro.id)
    assert erro.value.status_code == 409


def test_extrato_ignora_canceladas_e_excluidas(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    criar_venda("100.00", cliente)
    criar_venda("900.00", cliente, status="cancelado")
    excluida = criar_venda("800.00", cliente)
    excluida.deleted_at = date(2026, 1, 1)
    db.commit()

    extrato = fin.extrato_cliente(db, cliente.id)
    assert extrato["resumo"]["total_bruto"] == D("100.00")
    assert len(extrato["titulos"]) == 1


def test_alocacoes_simultaneas_nao_ultrapassam_o_saldo(db, criar_cliente, criar_venda):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    cliente_id, venda_id = cliente.id, venda.id  # sessões não são compartilhadas entre threads
    barreira = threading.Barrier(2)
    resultados = []

    def tentar():
        sessao = SessionLocal()
        try:
            barreira.wait()
            fin.registrar_recebimento(
                sessao,
                cliente_id=cliente_id,
                data_pagamento=date(2026, 11, 1),
                forma_pagamento="PIX",
                valor_total=D("80.00"),
                alocacoes=[(venda_id, D("80.00"))],
            )
            sessao.commit()
            resultados.append("ok")
        except HTTPException as erro:
            sessao.rollback()
            resultados.append(erro.status_code)
        finally:
            sessao.close()

    threads = [threading.Thread(target=tentar) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(map(str, resultados)) == ["409", "ok"]
    db.expire_all()
    assert fin.mapa_pagos(db, [venda_id])[venda_id] == D("80.00")
