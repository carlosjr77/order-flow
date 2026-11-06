import pytest


@pytest.fixture
def clientes(criar_cliente):
    nomes = [
        ("Restaurante do Baru", "11.111.111/0001-11"),
        ("Baru Cozinha", "22.222.222/0001-22"),
        ("BARU", "33.333.333/0001-33"),
        ("Baru Bar", None),
        ("Small Rider Hamburgueria", None),
        ("João Comércio", "123.456.789-01"),
        ("Loja 2", None),
        ("Café 100% Arábica", None),
    ]
    return {nome: criar_cliente(nome=nome, documento=documento) for nome, documento in nomes}


def nomes(client, headers, busca, limit=100):
    resposta = client.get("/api/clientes", params={"busca": busca, "limit": limit}, headers=headers)
    assert resposta.status_code == 200, resposta.text
    return [c["nome"] for c in resposta.json()]


def test_busca_parcial_traz_todos_que_contem_o_termo(client, operador_headers, clientes):
    resultado = nomes(client, operador_headers, "Baru")
    assert set(resultado) == {"Restaurante do Baru", "Baru Cozinha", "BARU", "Baru Bar"}


def test_quem_comeca_com_o_termo_vem_primeiro(client, operador_headers, clientes):
    resultado = nomes(client, operador_headers, "baru")
    assert resultado == ["BARU", "Baru Bar", "Baru Cozinha", "Restaurante do Baru"]
    assert nomes(client, operador_headers, "baru", limit=1) == ["BARU"]


@pytest.mark.parametrize("termo", ["small rider", "SMALL RIDER", "Small  Rider", "rider", "mall ri"])
def test_ignora_maiusculas_espacos_e_busca_no_meio(client, operador_headers, clientes, termo):
    assert nomes(client, operador_headers, termo) == ["Small Rider Hamburgueria"]


@pytest.mark.parametrize("termo", ["joao", "JOÃO", "comercio", "joão comércio"])
def test_ignora_acentos(client, operador_headers, clientes, termo):
    assert nomes(client, operador_headers, termo) == ["João Comércio"]


@pytest.mark.parametrize("termo", ["12345678901", "123.456.789-01", "456789"])
def test_busca_por_documento_com_ou_sem_mascara(client, operador_headers, clientes, termo):
    assert nomes(client, operador_headers, termo) == ["João Comércio"]


def test_poucos_digitos_nao_buscam_no_documento(client, operador_headers, clientes):
    assert nomes(client, operador_headers, "Loja 2") == ["Loja 2"]


def test_curinga_digitado_e_texto(client, operador_headers, clientes):
    assert nomes(client, operador_headers, "100%") == ["Café 100% Arábica"]
    assert nomes(client, operador_headers, "_") == []


def test_sem_busca_lista_em_ordem_alfabetica(client, operador_headers, clientes):
    resultado = nomes(client, operador_headers, "   ")
    assert len(resultado) == len(clientes)
    assert resultado[0] == "BARU"
