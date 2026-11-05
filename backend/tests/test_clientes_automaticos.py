import threading
from datetime import datetime

import pytest

from app.core.database import SessionLocal
from app.models import AuditLog, Cliente, Recebimento, Venda
from app.utils import financeiro as fin


def corpo(produto, **extras):
    return {
        "itens": [{"produto_id": produto.id, "quantidade": 1, "valor_unitario": 100}],
        "forma_pagamento": "PIX",
        "valor_frete": 0,
        **extras,
    }


def test_finalizar_venda_com_nome_novo_cria_cliente(client, operador_headers, criar_produto, db):
    produto = criar_produto()

    resposta = client.post("/api/vendas", json=corpo(produto, nome_cliente=" Ana  Nova "), headers=operador_headers)

    assert resposta.status_code == 200
    cliente = db.query(Cliente).one()
    assert cliente.nome == "Ana Nova"
    assert cliente.documento is None
    assert resposta.json()["cliente_id"] == cliente.id
    assert db.query(AuditLog).filter(AuditLog.entidade == "cliente", AuditLog.acao == "criar").count() == 1


def test_finalizar_venda_com_nome_existente_nao_duplica(client, operador_headers, criar_cliente, criar_produto, db):
    cliente = criar_cliente(nome="João Comércio")
    produto = criar_produto()

    resposta = client.post("/api/vendas", json=corpo(produto, nome_cliente="JOAO  COMERCIO"), headers=operador_headers)

    assert resposta.json()["cliente_id"] == cliente.id
    assert db.query(Cliente).count() == 1
    assert db.query(AuditLog).filter(AuditLog.entidade == "cliente").count() == 0


def test_cliente_escolhido_no_cadastro_tem_prioridade_sobre_o_nome(client, operador_headers, criar_cliente, criar_produto, db):
    cliente = criar_cliente(nome="Mercado")
    produto = criar_produto()

    resposta = client.post(
        "/api/vendas",
        json=corpo(produto, cliente_id=cliente.id, nome_cliente="Outro Nome"),
        headers=operador_headers,
    )

    assert resposta.json()["cliente_id"] == cliente.id
    assert db.query(Cliente).count() == 1


def test_venda_sem_nome_nao_cria_cliente(client, operador_headers, criar_produto, db):
    produto = criar_produto()
    resposta = client.post("/api/vendas", json=corpo(produto), headers=operador_headers)
    assert resposta.status_code == 200
    assert resposta.json()["cliente_id"] is None
    assert db.query(Cliente).count() == 0


def test_nome_com_dois_cadastros_nao_bloqueia_a_venda(client, operador_headers, criar_cliente, criar_produto, db):
    criar_cliente(nome="Maria", documento="1")
    criar_cliente(nome="MARIA", documento="2")
    produto = criar_produto()

    resposta = client.post("/api/vendas", json=corpo(produto, nome_cliente="Maria"), headers=operador_headers)

    assert resposta.status_code == 200
    assert resposta.json()["cliente_id"] is None
    assert db.query(Cliente).count() == 2


def test_concluir_venda_sem_vinculo_cria_cliente_e_liga_o_recebimento(client, operador_headers, criar_venda, db):
    venda = criar_venda("100.00", nome_cliente="Ana Nova")

    assert client.put(f"/api/vendas/{venda.id}/concluir", headers=operador_headers).status_code == 200

    db.expire_all()
    cliente = db.query(Cliente).one()
    assert db.get(Venda, venda.id).cliente_id == cliente.id
    assert db.query(Recebimento).one().cliente_id == cliente.id
    assert fin.extrato_cliente(db, cliente.id)["resumo"]["saldo_liquido"] == 0


def test_editar_venda_sem_vinculo_cria_cliente(client, operador_headers, criar_venda, criar_produto, db):
    venda = criar_venda("100.00", nome_cliente="Antigo")
    produto = criar_produto()

    resposta = client.put(
        f"/api/vendas/{venda.id}",
        json=corpo(produto, nome_cliente="Nome Corrigido", cliente_id=None),
        headers=operador_headers,
    )

    assert resposta.status_code == 200
    assert db.query(Cliente).one().nome == "Nome Corrigido"
    assert resposta.json()["cliente_id"] == db.query(Cliente).one().id


def test_vendas_simultaneas_criam_um_unico_cliente(db):
    barreira = threading.Barrier(4)
    erros = []

    def criar():
        sessao = SessionLocal()
        try:
            barreira.wait()
            fin.obter_ou_criar_cliente(sessao, "Cliente Concorrente")
            sessao.commit()
        except Exception as erro:  # noqa: BLE001
            erros.append(erro)
        finally:
            sessao.close()

    threads = [threading.Thread(target=criar) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert erros == []
    assert db.query(Cliente).count() == 1


def test_resolver_cliente_para_receber(client, operador_headers, criar_cliente, db):
    existente = criar_cliente(nome="João Comércio")
    url = "/api/financeiro/clientes/resolver"

    resposta = client.post(url, json={"nome": "joao comercio"}, headers=operador_headers)
    assert resposta.json() == {"id": existente.id, "nome": "João Comércio", "criado": False}

    novo = client.post(url, json={"nome": "Cliente Novo"}, headers=operador_headers).json()
    assert novo["criado"] is True
    recebimento = client.post(
        "/api/financeiro/recebimentos",
        json={
            "cliente_id": novo["id"],
            "data_pagamento": "2026-11-01",
            "forma_pagamento": "PIX",
            "valor_total": "10.00",
        },
        headers=operador_headers,
    )
    assert recebimento.status_code == 201

    assert client.post(url, json={"nome": "   "}, headers=operador_headers).status_code == 400


def test_resolver_com_dois_cadastros_retorna_conflito(client, operador_headers, criar_cliente):
    criar_cliente(nome="Maria", documento="1")
    criar_cliente(nome="MARIA", documento="2")
    resposta = client.post("/api/financeiro/clientes/resolver", json={"nome": "maria"}, headers=operador_headers)
    assert resposta.status_code == 409


@pytest.fixture
def vendas_filtro(db, criar_cliente, criar_venda):
    joao = criar_cliente(nome="João Comércio", documento="12.345.678/0001-90")
    antiga = criar_venda("300.00", joao, vencimento=datetime(2025, 2, 1).date(), data_venda=datetime(2025, 1, 1, 10))
    recente = criar_venda("200.00", joao, data_venda=datetime(2026, 6, 1, 10))
    sem_vinculo = criar_venda("70.00", nome_cliente="Fulano", data_venda=datetime(2026, 8, 1, 10))
    cancelada = criar_venda("80.00", joao, status="cancelado", data_venda=datetime(2026, 7, 1, 10))
    fin.registrar_recebimento(
        db,
        cliente_id=joao.id,
        data_pagamento=datetime(2026, 11, 1).date(),
        forma_pagamento="PIX",
        valor_total=fin.centavos("50.00"),
        alocacoes=[(recente.id, fin.centavos("50.00"))],
    )
    db.commit()
    return {"antiga": antiga.id, "recente": recente.id, "sem_vinculo": sem_vinculo.id, "cancelada": cancelada.id}


def ids_vendas(client, headers, **params):
    resposta = client.get("/api/vendas", params=params, headers=headers)
    assert resposta.status_code == 200, resposta.text
    return [venda["id"] for venda in resposta.json()]


def test_listagem_de_vendas_vem_da_mais_recente(client, operador_headers, vendas_filtro):
    v = vendas_filtro
    assert ids_vendas(client, operador_headers) == [v["sem_vinculo"], v["cancelada"], v["recente"], v["antiga"]]


def test_filtros_de_vendas(client, operador_headers, vendas_filtro):
    v = vendas_filtro
    assert set(ids_vendas(client, operador_headers, busca="joao")) == {v["recente"], v["antiga"], v["cancelada"]}
    assert set(ids_vendas(client, operador_headers, busca="12345678000190")) == {v["recente"], v["antiga"], v["cancelada"]}
    assert ids_vendas(client, operador_headers, busca="fulano") == [v["sem_vinculo"]]
    assert ids_vendas(client, operador_headers, status_financeiro="parcial") == [v["recente"]]
    assert set(ids_vendas(client, operador_headers, status_financeiro="aberto")) == {v["antiga"], v["sem_vinculo"]}
    assert ids_vendas(client, operador_headers, status_filter="cancelado") == [v["cancelada"]]
    assert ids_vendas(client, operador_headers, data_inicio="2025-01-01", data_fim="2025-12-31") == [v["antiga"]]
    assert ids_vendas(
        client, operador_headers, tipo_data="vencimento", data_inicio="2025-02-01", data_fim="2025-02-01"
    ) == [v["antiga"]]


def test_filtro_de_vendas_com_intervalo_invertido(client, operador_headers):
    resposta = client.get(
        "/api/vendas", params={"data_inicio": "2026-02-01", "data_fim": "2026-01-01"}, headers=operador_headers
    )
    assert resposta.status_code == 400


def test_filtro_nao_duplica_venda_com_varias_alocacoes(client, operador_headers, criar_cliente, criar_venda, db):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    for _ in range(2):
        fin.registrar_recebimento(
            db,
            cliente_id=cliente.id,
            data_pagamento=datetime(2026, 11, 1).date(),
            forma_pagamento="PIX",
            valor_total=fin.centavos("10.00"),
            alocacoes=[(venda.id, fin.centavos("10.00"))],
        )
    db.commit()
    assert ids_vendas(client, operador_headers, status_financeiro="parcial") == [venda.id]
