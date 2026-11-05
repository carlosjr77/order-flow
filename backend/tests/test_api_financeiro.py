from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models import AuditLog, NFe, Venda
from app.utils import financeiro as fin


def corpo(cliente, valor="100.00", alocacoes=(), forma="PIX", data="2026-11-01"):
    return {
        "cliente_id": cliente.id,
        "data_pagamento": data,
        "forma_pagamento": forma,
        "valor_total": valor,
        "alocacoes": [{"venda_id": v.id, "valor": a} for v, a in alocacoes],
    }


@pytest.fixture
def cenario(db, criar_cliente, criar_venda):
    ana = criar_cliente(nome="João Comércio", documento="12.345.678/0001-90")
    bia = criar_cliente(nome="Bia 100% Natural", documento="111.222.333-44")
    antiga = criar_venda("300.00", ana, vencimento=date(2025, 1, 10), data_venda=datetime(2025, 1, 1, 10))
    parcial = criar_venda("200.00", ana, vencimento=date(2026, 6, 10), data_venda=datetime(2026, 6, 1, 10))
    paga = criar_venda("50.00", ana, vencimento=date(2026, 7, 10), data_venda=datetime(2026, 7, 1, 10))
    outra = criar_venda("70.00", bia, data_venda=datetime(2026, 8, 1, 10))
    fin.registrar_recebimento(
        db,
        cliente_id=ana.id,
        data_pagamento=date(2026, 11, 1),
        forma_pagamento="PIX",
        valor_total=Decimal("150.00"),
        alocacoes=[(parcial.id, Decimal("100.00")), (paga.id, Decimal("50.00"))],
    )
    db.commit()
    return {"ana": ana, "bia": bia, "antiga": antiga, "parcial": parcial, "paga": paga, "outra": outra}


def ids(resposta):
    assert resposta.status_code == 200, resposta.text
    return {item["venda_id"] for item in resposta.json()["itens"]}


def buscar(client, headers, **params):
    return client.get("/api/financeiro/titulos", params=params, headers=headers)


def test_busca_por_cliente_retorna_todos_os_meses(client, operador_headers, cenario):
    resposta = buscar(client, operador_headers, busca="João")
    assert ids(resposta) == {cenario["antiga"].id, cenario["parcial"].id, cenario["paga"].id}


def test_busca_ignora_acento(client, operador_headers, cenario):
    assert cenario["antiga"].id in ids(buscar(client, operador_headers, busca="joao comercio"))


def test_busca_trata_curinga_como_texto(client, operador_headers, cenario):
    assert ids(buscar(client, operador_headers, busca="100%")) == {cenario["outra"].id}
    assert ids(buscar(client, operador_headers, busca="%")) == {cenario["outra"].id}
    assert ids(buscar(client, operador_headers, busca="_")) == set()


@pytest.mark.parametrize("documento", ["12.345.678/0001-90", "12345678000190", "345678"])
def test_busca_por_documento_com_ou_sem_mascara(client, operador_headers, cenario, documento):
    assert cenario["antiga"].id in ids(buscar(client, operador_headers, busca=documento))
    assert cenario["outra"].id not in ids(buscar(client, operador_headers, busca=documento))


def test_venda_sem_vinculo_e_encontrada_pelo_nome(client, operador_headers, criar_venda):
    venda = criar_venda("10.00", nome_cliente="Digitado à Mão")
    item = buscar(client, operador_headers, busca="digitado").json()["itens"][0]
    assert item["venda_id"] == venda.id
    assert item["cliente_id"] is None
    assert item["cliente_nome"] == "Digitado à Mão"


@pytest.mark.parametrize("status,esperado", [
    ("aberto", {"antiga", "outra"}),
    ("parcial", {"parcial"}),
    ("liquidada", {"paga"}),
])
def test_filtro_por_status(client, operador_headers, cenario, status, esperado):
    assert ids(buscar(client, operador_headers, status=status)) == {cenario[e].id for e in esperado}


def test_filtro_de_data_por_emissao_e_vencimento(client, operador_headers, cenario):
    assert ids(buscar(
        client, operador_headers, data_inicio="2026-06-01", data_fim="2026-06-30"
    )) == {cenario["parcial"].id}
    assert ids(buscar(
        client, operador_headers, tipo_data="vencimento", data_inicio="2026-07-10", data_fim="2026-07-10"
    )) == {cenario["paga"].id}


def test_intervalo_invertido(client, operador_headers):
    assert buscar(client, operador_headers, data_inicio="2026-02-01", data_fim="2026-01-01").status_code == 400


def test_paginacao_e_totais_cobrem_todo_o_resultado(client, operador_headers, cenario):
    primeira = buscar(client, operador_headers, cliente_id=cenario["ana"].id, limite=2, pagina=1).json()
    segunda = buscar(client, operador_headers, cliente_id=cenario["ana"].id, limite=2, pagina=2).json()

    assert primeira["total"] == 3
    assert len(primeira["itens"]) == 2
    assert len(segunda["itens"]) == 1
    assert {i["venda_id"] for i in primeira["itens"]}.isdisjoint({i["venda_id"] for i in segunda["itens"]})
    assert primeira["totais"] == {"valor_original": 550.0, "valor_pago": 150.0, "saldo": 400.0}
    # Vencimento mais antigo primeiro
    assert primeira["itens"][0]["venda_id"] == cenario["antiga"].id


def test_titulo_exibe_numero_da_nfe_autorizada(client, operador_headers, cenario, db):
    db.add(NFe(venda_id=cenario["antiga"].id, numero=456, serie=1, status="autorizada"))
    db.add(NFe(venda_id=cenario["parcial"].id, numero=457, serie=1, status="rejeitada"))
    db.commit()
    itens = {i["venda_id"]: i for i in buscar(client, operador_headers).json()["itens"]}
    assert itens[cenario["antiga"].id]["numero_nfe"] == 456
    assert itens[cenario["antiga"].id]["descricao"] == "NF-e nº 456"
    assert itens[cenario["parcial"].id]["numero_nfe"] is None


def test_canceladas_ficam_fora(client, operador_headers, criar_venda):
    criar_venda("10.00", status="cancelado")
    assert buscar(client, operador_headers).json()["total"] == 0


def test_requer_autenticacao(client):
    assert client.get("/api/financeiro/titulos").status_code in (401, 403)


def test_criar_recebimento_e_extrato(client, operador_headers, criar_cliente, criar_venda, db):
    cliente = criar_cliente()
    venda = criar_venda("1931.00", cliente)

    resposta = client.post(
        "/api/financeiro/recebimentos",
        json=corpo(cliente, "3000.00", [(venda, "1500.00")]),
        headers=operador_headers,
    )

    assert resposta.status_code == 201, resposta.text
    assert resposta.json()["valor_disponivel"] == 1500.0
    assert db.query(AuditLog).filter(AuditLog.entidade == "recebimento").count() == 1

    extrato = client.get(f"/api/financeiro/clientes/{cliente.id}/extrato", headers=operador_headers).json()
    assert extrato["cliente"]["nome"] == cliente.nome
    assert extrato["resumo"] == {
        "total_bruto": 1931.0,
        "total_em_aberto": 431.0,
        "total_recebido": 3000.0,
        "total_recebido_avulso": 3000.0,
        "credito_disponivel": 1500.0,
        "saldo_liquido": -1069.0,
    }
    titulo = extrato["titulos"][0]
    assert titulo["descricao"] == f"Pedido #{venda.id}"
    assert (titulo["valor_original"], titulo["valor_pago"], titulo["saldo"]) == (1931.0, 1500.0, 431.0)
    assert titulo["status_financeiro"] == "parcial"
    assert extrato["recebimentos"][0]["valor_disponivel"] == 1500.0


@pytest.mark.parametrize("valor", ["10.999", "0", "-5"])
def test_valor_invalido_retorna_422(client, operador_headers, criar_cliente, valor):
    cliente = criar_cliente()
    resposta = client.post("/api/financeiro/recebimentos", json=corpo(cliente, valor), headers=operador_headers)
    assert resposta.status_code == 422


def test_data_futura_retorna_400(client, operador_headers, criar_cliente):
    cliente = criar_cliente()
    futuro = (fin.hoje() + timedelta(days=1)).isoformat()
    resposta = client.post("/api/financeiro/recebimentos", json=corpo(cliente, data=futuro), headers=operador_headers)
    assert resposta.status_code == 400


def test_alocacao_invalida_nao_grava_recebimento(client, operador_headers, criar_cliente, criar_venda, db):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    resposta = client.post(
        "/api/financeiro/recebimentos",
        json=corpo(cliente, "500.00", [(venda, "100.01")]),
        headers=operador_headers,
    )
    assert resposta.status_code == 409
    extrato = client.get(f"/api/financeiro/clientes/{cliente.id}/extrato", headers=operador_headers).json()
    assert extrato["recebimentos"] == []


def test_usar_credito_pela_api(client, operador_headers, criar_cliente, criar_venda, db):
    cliente = criar_cliente()
    venda = criar_venda("100.00", cliente)
    recebimento = client.post(
        "/api/financeiro/recebimentos", json=corpo(cliente, "100.00"), headers=operador_headers
    ).json()

    resposta = client.post(
        f"/api/financeiro/recebimentos/{recebimento['id']}/alocacoes",
        json={"alocacoes": [{"venda_id": venda.id, "valor": "100.00"}]},
        headers=operador_headers,
    )

    assert resposta.status_code == 200
    assert resposta.json()["valor_disponivel"] == 0
    db.expire_all()
    assert db.get(Venda, venda.id).status == "concluído"


def test_estorno_exige_admin_e_motivo(client, operador_headers, admin_headers, criar_cliente, db):
    cliente = criar_cliente()
    recebimento = client.post(
        "/api/financeiro/recebimentos", json=corpo(cliente), headers=operador_headers
    ).json()
    url = f"/api/financeiro/recebimentos/{recebimento['id']}/estornar"

    assert client.post(url, json={"motivo": "Erro"}, headers=operador_headers).status_code == 403
    assert client.post(url, json={"motivo": ""}, headers=admin_headers).status_code == 422
    assert client.post(url, json={"motivo": "   "}, headers=admin_headers).status_code == 400

    resposta = client.post(url, json={"motivo": "Erro"}, headers=admin_headers)
    assert resposta.status_code == 200
    assert resposta.json()["motivo_estorno"] == "Erro"
    assert client.post(url, json={"motivo": "Erro"}, headers=admin_headers).status_code == 409


def test_extrato_de_cliente_inexistente(client, operador_headers):
    assert client.get("/api/financeiro/clientes/999/extrato", headers=operador_headers).status_code == 404


def test_vendas_sem_cliente_e_vinculo(client, operador_headers, criar_cliente, criar_venda, db):
    cliente = criar_cliente()
    concluida = criar_venda("20.00", nome_cliente="B", status="concluído")
    pendente = criar_venda("10.00", nome_cliente="A")
    criar_venda("30.00", nome_cliente="C", status="cancelado")

    lista = client.get("/api/financeiro/vendas-sem-cliente", headers=operador_headers).json()
    assert [i["venda_id"] for i in lista["itens"]] == [pendente.id, concluida.id]

    url = f"/api/financeiro/vendas/{pendente.id}/cliente"
    assert client.put(url, json={"cliente_id": 999}, headers=operador_headers).status_code == 404
    assert client.put(url, json={"cliente_id": cliente.id}, headers=operador_headers).status_code == 200
    lista = client.get("/api/financeiro/vendas-sem-cliente", headers=operador_headers).json()
    assert [i["venda_id"] for i in lista["itens"]] == [concluida.id]
