from datetime import date, datetime
from decimal import Decimal

import pytest

from app.models import NFe
from app.utils import financeiro as fin

URL = "/api/financeiro/clientes/{}/relatorio"


@pytest.fixture
def cenario(db, criar_cliente, criar_venda):
    joao = criar_cliente(nome="João Comércio")
    outro = criar_cliente(nome="Outro", documento="1")
    marco = criar_venda("1931.00", joao, vencimento=date(2026, 4, 5), data_venda=datetime(2026, 3, 5, 10))
    abril = criar_venda("3600.00", joao, vencimento=date(2026, 5, 5), data_venda=datetime(2026, 4, 20, 10))
    criar_venda("5000.00", joao, vencimento=date(2026, 9, 5), data_venda=datetime(2026, 8, 5, 10))
    criar_venda("900.00", joao, status="cancelado", data_venda=datetime(2026, 3, 10, 10))
    criar_venda("700.00", outro, data_venda=datetime(2026, 3, 15, 10))
    fin.registrar_recebimento(
        db,
        cliente_id=joao.id,
        data_pagamento=date(2026, 11, 1),
        forma_pagamento="PIX",
        valor_total=Decimal("1500.00"),
        alocacoes=[(marco.id, Decimal("1500.00"))],
    )
    db.commit()
    return {"joao": joao, "marco": marco, "abril": abril}


def relatorio(client, headers, cliente_id, **params):
    return client.get(URL.format(cliente_id), params=params, headers=headers)


def test_relatorio_por_emissao_traz_quantidade_e_totais(client, operador_headers, cenario):
    resposta = relatorio(
        client, operador_headers, cenario["joao"].id, data_inicio="2026-03-01", data_fim="2026-04-30"
    )

    assert resposta.status_code == 200, resposta.text
    dados = resposta.json()
    assert dados["cliente"]["nome"] == "João Comércio"
    assert dados["periodo"] == {"data_inicio": "2026-03-01", "data_fim": "2026-04-30", "tipo_data": "emissao"}
    assert dados["resumo"] == {
        "quantidade": 2,
        "valor_total": 5531.0,
        "valor_pago": 1500.0,
        "saldo_pendente": 4031.0,
    }
    # Ordem cronológica; cancelada e nota de outro cliente ficam fora
    assert [t["venda_id"] for t in dados["titulos"]] == [cenario["marco"].id, cenario["abril"].id]
    primeiro = dados["titulos"][0]
    assert primeiro["status_financeiro"] == "parcial"
    assert primeiro["saldo"] == 431.0
    assert "cliente_nome" not in primeiro


def test_relatorio_por_vencimento(client, operador_headers, cenario):
    dados = relatorio(
        client,
        operador_headers,
        cenario["joao"].id,
        data_inicio="2026-05-01",
        data_fim="2026-05-31",
        tipo_data="vencimento",
    ).json()
    assert [t["venda_id"] for t in dados["titulos"]] == [cenario["abril"].id]
    assert dados["resumo"]["quantidade"] == 1


def test_periodo_sem_notas_retorna_resumo_zerado(client, operador_headers, cenario):
    dados = relatorio(
        client, operador_headers, cenario["joao"].id, data_inicio="2020-01-01", data_fim="2020-12-31"
    ).json()
    assert dados["titulos"] == []
    assert dados["resumo"] == {"quantidade": 0, "valor_total": 0.0, "valor_pago": 0.0, "saldo_pendente": 0.0}


def test_relatorio_traz_numero_da_nfe(client, operador_headers, cenario, db):
    db.add(NFe(venda_id=cenario["marco"].id, numero=456, serie=1, status="autorizada"))
    db.commit()
    dados = relatorio(
        client, operador_headers, cenario["joao"].id, data_inicio="2026-03-01", data_fim="2026-03-31"
    ).json()
    assert dados["titulos"][0]["descricao"] == "NF-e nº 456"


def test_relatorio_acima_de_100_notas_nao_e_cortado(client, operador_headers, criar_cliente, criar_venda):
    cliente = criar_cliente()
    for _ in range(120):
        criar_venda("1.00", cliente, data_venda=datetime(2026, 6, 1, 10))
    dados = relatorio(client, operador_headers, cliente.id, data_inicio="2026-06-01", data_fim="2026-06-30").json()
    assert dados["resumo"]["quantidade"] == 120
    assert len(dados["titulos"]) == 120


@pytest.mark.parametrize("params,esperado", [
    ({"data_inicio": "2026-02-01", "data_fim": "2026-01-01"}, 400),
    ({"data_inicio": "2026-01-01"}, 422),
    ({"data_inicio": "2026-01-01", "data_fim": "2026-01-31", "tipo_data": "outro"}, 422),
])
def test_parametros_invalidos(client, operador_headers, cenario, params, esperado):
    assert relatorio(client, operador_headers, cenario["joao"].id, **params).status_code == esperado


def test_cliente_inexistente(client, operador_headers):
    resposta = relatorio(client, operador_headers, 999, data_inicio="2026-01-01", data_fim="2026-01-31")
    assert resposta.status_code == 404


def test_empresa_salva_chave_pix(client, admin_headers, db):
    corpo = {
        "nome": "Empresa Teste", "cnpj": "68.343.883/0001-76", "endereco": "Rua A", "numero": "1",
        "bairro": "Centro", "cidade": "São Paulo", "estado": "SP", "cep": "01000-000",
        "chave_pix": "68343883000176",
    }
    resposta = client.post("/api/empresas", json=corpo, headers=admin_headers)
    assert resposta.status_code in (200, 201), resposta.text
    assert resposta.json()["chave_pix"] == "68343883000176"

    atualizada = client.put(
        f"/api/empresas/{resposta.json()['id']}",
        json={"chave_pix": "financeiro@empresa.com.br", "emissao_nfe_habilitada": True},
        headers=admin_headers,
    )
    assert atualizada.status_code == 200, atualizada.text
    assert atualizada.json()["chave_pix"] == "financeiro@empresa.com.br"

    longa = client.put(f"/api/empresas/{resposta.json()['id']}", json={"chave_pix": "x" * 78}, headers=admin_headers)
    assert longa.status_code == 422
