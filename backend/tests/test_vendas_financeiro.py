from datetime import date
from decimal import Decimal

from app.models import ItemVenda, Recebimento, Venda
from app.utils import financeiro as fin


def receber(db, cliente, venda, valor):
    recebimento = fin.registrar_recebimento(
        db,
        cliente_id=cliente.id,
        data_pagamento=date(2026, 11, 1),
        forma_pagamento="PIX",
        valor_total=Decimal(valor),
        alocacoes=[(venda.id, Decimal(valor))],
    )
    db.commit()
    return recebimento


def corpo_edicao(produto, valor, **extras):
    return {
        "itens": [{"produto_id": produto.id, "quantidade": 1, "valor_unitario": valor}],
        "forma_pagamento": "PIX",
        "valor_frete": 0,
        **extras,
    }


def test_criar_venda_grava_cliente(client, operador_headers, criar_cliente, criar_produto, db):
    cliente = criar_cliente()
    produto = criar_produto()
    resposta = client.post(
        "/api/vendas",
        json=corpo_edicao(produto, 100, cliente_id=cliente.id, nome_cliente=cliente.nome),
        headers=operador_headers,
    )
    assert resposta.status_code == 200
    assert resposta.json()["cliente_id"] == cliente.id


def test_criar_venda_com_cliente_inexistente(client, operador_headers, criar_produto):
    produto = criar_produto()
    resposta = client.post(
        "/api/vendas",
        json=corpo_edicao(produto, 100, cliente_id=9999),
        headers=operador_headers,
    )
    assert resposta.status_code == 400


def test_listagem_traz_campos_financeiros(client, operador_headers, criar_cliente, criar_venda, db):
    cliente = criar_cliente()
    venda = criar_venda("1931.00", cliente)
    cancelada = criar_venda("10.00", cliente, status="cancelado")
    receber(db, cliente, venda, "1500.00")

    dados = client.get("/api/vendas", headers=operador_headers).json()
    por_id = {v["id"]: v for v in dados}

    assert por_id[venda.id]["valor_pago"] == 1500.0
    assert por_id[venda.id]["saldo"] == 431.0
    assert por_id[venda.id]["status_financeiro"] == "parcial"
    assert por_id[cancelada.id]["status_financeiro"] is None


def test_concluir_rota_quita_saldo(client, operador_headers, criar_cliente, criar_venda, db):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    resposta = client.put(f"/api/vendas/{venda.id}/concluir", headers=operador_headers)
    assert resposta.status_code == 200
    db.expire_all()
    assert db.get(Venda, venda.id).status == "concluído"
    assert db.query(Recebimento).one().origem == "conclusao"


def test_cancelar_e_excluir_bloqueados_com_avulso(client, operador_headers, criar_cliente, criar_venda, db):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    receber(db, cliente, venda, "50.00")

    assert client.put(f"/api/vendas/{venda.id}/cancelar", json={}, headers=operador_headers).status_code == 409
    assert client.request("DELETE", f"/api/vendas/{venda.id}", json={}, headers=operador_headers).status_code == 409
    db.expire_all()
    assert db.get(Venda, venda.id).status == "pendente"


def test_excluir_venda_concluida_estorna_automatico(client, operador_headers, criar_cliente, criar_venda, db):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    client.put(f"/api/vendas/{venda.id}/concluir", headers=operador_headers)

    resposta = client.request("DELETE", f"/api/vendas/{venda.id}", json={}, headers=operador_headers)

    assert resposta.status_code == 200
    db.expire_all()
    assert db.query(Recebimento).one().estornado_em is not None
    resumo = fin.extrato_cliente(db, cliente.id)["resumo"]
    assert resumo["total_bruto"] == resumo["total_recebido"] == Decimal("0")


def test_editar_abaixo_do_avulso_desfaz_tudo(client, operador_headers, criar_cliente, criar_venda, criar_produto, db):
    cliente = criar_cliente()
    produto = criar_produto()
    venda = criar_venda("100.00", cliente)
    db.add(ItemVenda(
        venda_id=venda.id,
        produto_id=produto.id,
        quantidade=Decimal("1"),
        valor_unitario=Decimal("100.00"),
        valor_total=Decimal("100.00"),
    ))
    db.commit()
    estoque_antes = produto.estoque_atual
    receber(db, cliente, venda, "80.00")

    resposta = client.put(
        f"/api/vendas/{venda.id}",
        json=corpo_edicao(produto, 50),
        headers=operador_headers,
    )

    assert resposta.status_code == 409
    db.expire_all()
    assert db.get(Venda, venda.id).valor_total == Decimal("100.00")
    assert db.get(type(produto), produto.id).estoque_atual == estoque_antes
    ativos = db.query(ItemVenda).filter(ItemVenda.venda_id == venda.id, ItemVenda.deleted_at.is_(None)).all()
    assert [i.valor_total for i in ativos] == [Decimal("100.00")]


def test_editar_com_status_concluido_quita_saldo(client, operador_headers, criar_cliente, criar_venda, criar_produto, db):
    cliente = criar_cliente()
    produto = criar_produto()
    venda = criar_venda("100.00", cliente)

    resposta = client.put(
        f"/api/vendas/{venda.id}",
        json=corpo_edicao(produto, 120, status="concluído"),
        headers=operador_headers,
    )

    assert resposta.status_code == 200
    db.expire_all()
    assert db.get(Venda, venda.id).status == "concluído"
    assert db.query(Recebimento).one().valor_total == Decimal("120.00")


def test_editar_sem_enviar_cliente_preserva_vinculo(client, operador_headers, criar_cliente, criar_venda, criar_produto, db):
    cliente = criar_cliente()
    produto = criar_produto()
    venda = criar_venda("100.00", cliente)

    client.put(f"/api/vendas/{venda.id}", json=corpo_edicao(produto, 100), headers=operador_headers)

    db.expire_all()
    assert db.get(Venda, venda.id).cliente_id == cliente.id
