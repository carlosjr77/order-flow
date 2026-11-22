"""Planejamento de compras: busca agrupada, consolidado por período, custo com histórico e devedores."""
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.models import ItemVenda, Produto, ProdutoCustoHistorico, TabelaPreco, TabelaPrecoItem, Venda
from app.utils import financeiro
from app.utils.consolidado_compras import separar_termos
from app.utils.sugestao_tabela import _mapear_unidade


def _produto(db, codigo, descricao, unidade="KG", custo="2.00", estoque="0"):
    produto = Produto(
        codigo_interno=codigo, descricao=descricao, unidade_medida=unidade,
        preco_custo=Decimal(custo), estoque_atual=Decimal(estoque),
    )
    db.add(produto)
    db.commit()
    db.refresh(produto)
    return produto


def _venda(db, itens, *, data_venda=datetime(2026, 11, 10, 10), data_entrega=None, status="pendente",
           deleted=False, cliente_id=None, tabela_preco_id=None, valor_total=None, vencimento=None):
    total = sum(Decimal(q) * Decimal(v) for _, q, v, *_ in itens)
    venda = Venda(
        valor_total=Decimal(valor_total) if valor_total else total, status=status, data_venda=data_venda,
        data_entrega=data_entrega, deleted_at=datetime.now() if deleted else None,
        cliente_id=cliente_id, tabela_preco_id=tabela_preco_id, data_vencimento=vencimento,
    )
    db.add(venda)
    db.flush()
    for produto, qtd, valor, *custo in itens:
        db.add(ItemVenda(
            venda_id=venda.id, produto_id=produto.id, quantidade=Decimal(qtd),
            valor_unitario=Decimal(valor), valor_total=Decimal(qtd) * Decimal(valor),
            custo_unitario=Decimal(custo[0]) if custo else None,
        ))
    db.commit()
    db.refresh(venda)
    return venda


PERIODO = {"data_inicio": "2026-11-01", "data_fim": "2026-11-30"}


# ---------------------------------------------------------------- unidades e termos

def test_saca_e_reconhecida_como_unidade_propria():
    assert _mapear_unidade("saca") == "SC"
    assert _mapear_unidade("SACOS") == "SC"
    assert _mapear_unidade("sc.") == "SC"
    assert _mapear_unidade("cx") == "CX"


def test_separar_termos_remove_repetidos_e_curtos():
    assert separar_termos("laranja, Limão; limao,a, laranja") == ["laranja", "Limão"]
    assert separar_termos("") == []


# ---------------------------------------------------------------- busca de produtos

def test_busca_de_produtos_ignora_acentos(client, db, admin_headers):
    _produto(db, "L1", "Limão Taiti")
    _produto(db, "B1", "Banana Prata")
    resposta = client.get("/api/produtos", params={"busca": "limao"}, headers=admin_headers)
    assert resposta.status_code == 200
    assert [p["descricao"] for p in resposta.json()] == ["Limão Taiti"]


def test_agrupado_separa_variacoes_por_termo_e_unidade(client, db, admin_headers):
    _produto(db, "LR-KG", "Laranja Pera", "KG", "2.00", "10")
    _produto(db, "LR-SC", "Laranja Pera Saca", "SC", "40.00", "3")
    _produto(db, "LR-CX", "Laranja Lima", "cx", "35.00", "2")
    _produto(db, "LM-KG", "Limão Taiti", "KG", "3.00", "5")
    _produto(db, "BN", "Banana", "KG", "1.00")

    resposta = client.get("/api/produtos/agrupado", params={"termo": "laranja, limão, kiwi"}, headers=admin_headers)
    assert resposta.status_code == 200
    dados = resposta.json()
    assert [g["termo"] for g in dados["grupos"]] == ["laranja", "limão"]
    assert dados["termos_sem_resultado"] == ["kiwi"]

    laranja = dados["grupos"][0]
    assert laranja["total_produtos"] == 3
    assert {u["unidade"]: u["estoque"] for u in laranja["unidades"]} == {"KG": 10.0, "SC": 3.0, "CX": 2.0}


def test_agrupado_mostra_preco_em_cada_tabela_ativa(client, db, admin_headers):
    produto = _produto(db, "LR", "Laranja", "KG", "2.00")
    varejo = TabelaPreco(nome="Varejo", margem_geral_percentual=Decimal("50"), ativa=True)
    atacado = TabelaPreco(nome="Atacado", margem_geral_percentual=Decimal("20"), ativa=True)
    inativa = TabelaPreco(nome="Antiga", margem_geral_percentual=Decimal("10"), ativa=False)
    db.add_all([varejo, atacado, inativa])
    db.flush()
    db.add(TabelaPrecoItem(tabela_preco_id=atacado.id, produto_id=produto.id, margem_especifica_percentual=Decimal("25")))
    db.commit()

    item = client.get("/api/produtos/agrupado", params={"termo": "laranja"}, headers=admin_headers).json()["grupos"][0]["itens"][0]
    precos = {p["tabela_nome"]: (p["preco"], p["excecao"]) for p in item["precos_tabelas"]}
    assert precos == {"Atacado": (2.5, True), "Varejo": (3.0, False)}


def test_agrupado_exige_termo(client, admin_headers):
    assert client.get("/api/produtos/agrupado", params={"termo": " , "}, headers=admin_headers).status_code == 400


# ---------------------------------------------------------------- consolidado por período

def test_consolidado_soma_por_produto_e_subtotal_por_unidade(client, db, admin_headers):
    kg = _produto(db, "LR-KG", "Laranja Pera", "KG", "2.00", "7")
    sc = _produto(db, "LR-SC", "Laranja Saca", "SC", "40.00")
    limao = _produto(db, "LM", "Limão", "KG", "3.00")
    _venda(db, [(kg, "10", "4.00"), (sc, "2", "60.00")])
    _venda(db, [(kg, "5", "4.00"), (limao, "3", "5.00")], data_venda=datetime(2026, 11, 20, 9))

    resposta = client.get("/api/vendas/consolidado-produtos", params={**PERIODO, "termo": "laranja"}, headers=admin_headers)
    assert resposta.status_code == 200
    dados = resposta.json()
    assert dados["periodo"]["dias"] == 30
    assert dados["totais"]["pedidos"] == 2
    grupo = dados["grupos"][0]
    assert grupo["termo"] == "laranja"
    por_unidade = {s["unidade"]: s["quantidade"] for s in grupo["subtotais_por_unidade"]}
    assert por_unidade == {"KG": 15.0, "SC": 2.0}  # KG e SC nunca somam entre si
    kg_item = next(i for i in grupo["itens"] if i["produto_id"] == kg.id)
    assert kg_item["quantidade"] == 15.0
    assert kg_item["pedidos"] == 2
    assert kg_item["media_diaria"] == 0.5
    assert kg_item["estoque_atual"] == 7.0


def test_consolidado_usa_data_de_entrega_e_ignora_canceladas_e_excluidas(client, db, admin_headers):
    produto = _produto(db, "LR", "Laranja")
    _venda(db, [(produto, "1", "4")], data_venda=datetime(2026, 10, 25), data_entrega=date(2026, 11, 2))  # entra
    _venda(db, [(produto, "2", "4")], data_venda=datetime(2026, 11, 28), data_entrega=date(2026, 12, 3))  # fora
    _venda(db, [(produto, "4", "4")], status="cancelado")
    _venda(db, [(produto, "8", "4")], deleted=True)

    dados = client.get("/api/vendas/consolidado-produtos", params=PERIODO, headers=admin_headers).json()
    assert dados["grupos"][0]["itens"][0]["quantidade"] == 1.0

    com_canceladas = client.get(
        "/api/vendas/consolidado-produtos", params={**PERIODO, "incluir_canceladas": True}, headers=admin_headers
    ).json()
    assert com_canceladas["grupos"][0]["itens"][0]["quantidade"] == 5.0


def test_consolidado_sem_termo_agrupa_pela_primeira_palavra(client, db, admin_headers):
    _venda(db, [(_produto(db, "A", "Laranja Pera"), "1", "1"), (_produto(db, "B", "Limão"), "1", "1"),
                (_produto(db, "C", "laranja lima"), "1", "1")])
    dados = client.get("/api/vendas/consolidado-produtos", params=PERIODO, headers=admin_headers).json()
    assert [(g["termo"], len(g["itens"])) for g in dados["grupos"]] == [("Laranja", 2), ("Limão", 1)]


def test_consolidado_custo_congelado_e_custo_atual_para_itens_antigos(client, db, admin_headers):
    produto = _produto(db, "LR", "Laranja", custo="9.00")
    _venda(db, [(produto, "2", "10.00", "3.00")])  # custo congelado 3
    _venda(db, [(produto, "1", "10.00")])  # sem custo gravado -> usa 9 (atual)
    item = client.get("/api/vendas/consolidado-produtos", params=PERIODO, headers=admin_headers).json()["grupos"][0]["itens"][0]
    assert item["faturamento"] == 30.0
    assert item["custo"] == 15.0
    assert item["lucro"] == 15.0


def test_consolidado_valida_periodo(client, admin_headers):
    url = "/api/vendas/consolidado-produtos"
    assert client.get(url, params={"data_inicio": "2026-11-10", "data_fim": "2026-11-01"}, headers=admin_headers).status_code == 400
    assert client.get(url, params={"data_inicio": "2024-01-01", "data_fim": "2026-01-01"}, headers=admin_headers).status_code == 400
    assert client.get(url, params={"data_inicio": "2026-11-10"}, headers=admin_headers).status_code == 422


def test_consolidado_exige_login(client):
    assert client.get("/api/vendas/consolidado-produtos", params=PERIODO).status_code in (401, 403)


# ---------------------------------------------------------------- custo de produto

def test_atualizar_custo_registra_historico_e_sincroniza_tabelas(client, db, admin_headers):
    produto = _produto(db, "LR", "Laranja", custo="2.00")
    tabela = TabelaPreco(nome="Atacado", margem_geral_percentual=Decimal("10"), ativa=True)
    db.add(tabela)
    db.flush()
    db.add(TabelaPrecoItem(tabela_preco_id=tabela.id, produto_id=produto.id,
                           margem_especifica_percentual=Decimal("50"), preco_calculado=Decimal("3.00")))
    db.commit()

    resposta = client.patch(f"/api/produtos/{produto.id}/custo", headers=admin_headers,
                            json={"preco_custo": 4, "origem": "ceasa_sem_nf", "observacao": "Box 12"})
    assert resposta.status_code == 200
    assert resposta.json()["preco_custo"] == 4.0

    historico = client.get(f"/api/produtos/{produto.id}/custo/historico", headers=admin_headers).json()
    assert len(historico) == 1
    assert historico[0]["custo_anterior"] == 2.0 and historico[0]["custo_novo"] == 4.0
    assert historico[0]["origem"] == "ceasa_sem_nf" and historico[0]["observacao"] == "Box 12"

    db.expire_all()
    item = db.query(TabelaPrecoItem).filter_by(produto_id=produto.id).one()
    assert item.preco_calculado == Decimal("6.00")


def test_custo_igual_nao_gera_historico(client, db, admin_headers):
    produto = _produto(db, "LR", "Laranja", custo="2.00")
    client.patch(f"/api/produtos/{produto.id}/custo", headers=admin_headers, json={"preco_custo": 2})
    assert db.query(ProdutoCustoHistorico).count() == 0


def test_custo_invalido_e_recusado(client, db, admin_headers):
    produto = _produto(db, "LR", "Laranja")
    url = f"/api/produtos/{produto.id}/custo"
    assert client.patch(url, headers=admin_headers, json={"preco_custo": -1}).status_code == 422
    assert client.patch(url, headers=admin_headers, json={"preco_custo": 1, "origem": "outra"}).status_code == 422
    assert client.patch("/api/produtos/9999/custo", headers=admin_headers, json={"preco_custo": 1}).status_code == 404


def test_edicao_do_produto_tambem_registra_historico(client, db, admin_headers):
    produto = _produto(db, "LR", "Laranja", custo="2.00")
    assert client.put(f"/api/produtos/{produto.id}", headers=admin_headers, json={"preco_custo": 2.5}).status_code == 200
    assert db.query(ProdutoCustoHistorico).filter_by(produto_id=produto.id, origem="manual").count() == 1


def test_custo_em_lote_e_atomico(client, db, admin_headers):
    a = _produto(db, "A", "Laranja", custo="2.00")
    b = _produto(db, "B", "Limão", custo="3.00")

    falha = client.post("/api/produtos/custos/lote", headers=admin_headers,
                        json={"itens": [{"produto_id": a.id, "preco_custo": 5}, {"produto_id": 9999, "preco_custo": 1}]})
    assert falha.status_code == 404
    db.expire_all()
    assert db.get(Produto, a.id).preco_custo == Decimal("2.00")

    ok = client.post("/api/produtos/custos/lote", headers=admin_headers,
                     json={"itens": [{"produto_id": a.id, "preco_custo": 5}, {"produto_id": b.id, "preco_custo": 3}],
                           "observacao": "CEASA 22/11"})
    assert ok.status_code == 200
    assert ok.json()["alterados"] == 1 and ok.json()["sem_alteracao"] == 1
    assert db.query(ProdutoCustoHistorico).filter_by(origem="ceasa_sem_nf").count() == 1


# ---------------------------------------------------------------- custo congelado na venda

def test_venda_grava_custo_do_dia_e_edicao_preserva(client, db, admin_headers):
    produto = _produto(db, "LR", "Laranja", custo="3.00", estoque="100")
    venda_id = client.post("/api/vendas", headers=admin_headers, json={
        "itens": [{"produto_id": produto.id, "quantidade": 10, "valor_unitario": 5}],
    }).json()["id"]

    client.patch(f"/api/produtos/{produto.id}/custo", headers=admin_headers, json={"preco_custo": 4.5})

    detalhe = client.get(f"/api/vendas/{venda_id}", headers=admin_headers).json()
    assert detalhe["itens"][0]["preco_custo"] == 3.0  # relatório não muda com o custo novo

    editar = client.put(f"/api/vendas/{venda_id}", headers=admin_headers, json={
        "itens": [{"produto_id": produto.id, "quantidade": 12, "valor_unitario": 5}],
    })
    assert editar.status_code == 200, editar.text
    item_ativo = db.query(ItemVenda).filter_by(venda_id=venda_id, deleted_at=None).one()
    assert item_ativo.custo_unitario == Decimal("3.00")


# ---------------------------------------------------------------- devedores

def test_resumo_de_devedores(client, db, admin_headers, criar_cliente):
    joao = criar_cliente(nome="João", documento="111.111.111-11")
    maria = criar_cliente(nome="Maria", documento="222.222.222-22")
    produto = _produto(db, "LR", "Laranja")
    ontem = financeiro.hoje() - timedelta(days=1)
    _venda(db, [(produto, "1", "100")], cliente_id=joao.id, vencimento=ontem)
    _venda(db, [(produto, "1", "50")], cliente_id=joao.id)
    _venda(db, [(produto, "1", "30")], cliente_id=maria.id)
    _venda(db, [(produto, "1", "999")], cliente_id=maria.id, status="cancelado")

    dados = client.get("/api/financeiro/devedores", headers=admin_headers).json()
    assert Decimal(str(dados["total_saldo"])) == Decimal("180.00")
    assert Decimal(str(dados["total_vencido"])) == Decimal("100.00")
    assert [(c["cliente_nome"], Decimal(str(c["saldo"]))) for c in dados["clientes"]] == [
        ("João", Decimal("150.00")), ("Maria", Decimal("30.00")),
    ]
