"""Infraestrutura de testes. As travas abaixo impedem o uso do banco do .env."""
import os
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy.engine import make_url

_url_teste = os.environ.get("TEST_DATABASE_URL")
if not _url_teste:
    pytest.exit("Defina TEST_DATABASE_URL apontando para um Postgres de teste.", returncode=2)
if "test" not in (make_url(_url_teste).database or ""):
    pytest.exit("O nome do banco em TEST_DATABASE_URL precisa conter 'test'.", returncode=2)

# Precisa acontecer antes de qualquer import de app: app.main cria tabelas ao ser importado.
os.environ["DATABASE_URL"] = _url_teste
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Cliente, ItemVenda, Produto, Usuario, Venda  # noqa: E402

assert engine.url.database == make_url(_url_teste).database


@pytest.fixture(autouse=True)
def banco_limpo():
    tabelas = ", ".join(f'"{tabela.name}"' for tabela in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tabelas} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def db():
    sessao = SessionLocal()
    try:
        yield sessao
    finally:
        sessao.rollback()
        sessao.close()


@pytest.fixture
def client():
    return TestClient(app)


def _usuario(db, username: str, perfil: str) -> Usuario:
    usuario = Usuario(
        username=username,
        email=f"{username}@teste.local",
        hashed_password="nao-usado",
        nome=username,
        perfil=perfil,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def _headers(usuario: Usuario) -> dict:
    token = create_access_token(data={
        "sub": usuario.username,
        "user_id": usuario.id,
        "perfil": usuario.perfil,
        "nome": usuario.nome,
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(db):
    return _headers(_usuario(db, "admin_teste", "admin"))


@pytest.fixture
def operador_headers(db):
    return _headers(_usuario(db, "operador_teste", "operador"))


@pytest.fixture
def criar_cliente(db):
    def _criar(nome="Mercado Exemplo", documento="12.345.678/0001-90", telefone="(11) 98888-7777"):
        cliente = Cliente(nome=nome, documento=documento, telefone=telefone)
        db.add(cliente)
        db.commit()
        db.refresh(cliente)
        return cliente
    return _criar


@pytest.fixture
def criar_venda(db):
    def _criar(
        valor="100.00",
        cliente=None,
        status="pendente",
        vencimento=None,
        nome_cliente=None,
        forma_pagamento="PIX",
        data_venda=None,
    ):
        venda = Venda(
            valor_total=Decimal(valor),
            cliente_id=cliente.id if cliente else None,
            nome_cliente=nome_cliente if nome_cliente is not None else (cliente.nome if cliente else None),
            status=status,
            forma_pagamento=forma_pagamento,
            data_vencimento=vencimento,
        )
        if data_venda is not None:
            venda.data_venda = data_venda
        db.add(venda)
        db.commit()
        db.refresh(venda)
        return venda
    return _criar


@pytest.fixture
def criar_produto(db):
    def _criar(preco="100.00"):
        produto = Produto(
            codigo_interno="P1",
            descricao="Produto de teste",
            preco_custo=Decimal("1.00"),
            preco_venda=Decimal(preco),
            estoque_atual=Decimal("1000"),
            unidade_medida="UN",
        )
        db.add(produto)
        db.commit()
        db.refresh(produto)
        return produto
    return _criar
