#!/usr/bin/env python3
"""
Script para inicializar o banco de dados com dados de exemplo
Execute apenas após os containers estarem rodando
"""

import sys
import os
from pathlib import Path

# Adicionar diretório ao path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from app.core.database import Base, engine, SessionLocal
from app.core.security import get_password_hash
from app.models import Usuario, Produto
from app.core.config import settings

def init_database():
    """Inicializar banco de dados com tabelas e dados de exemplo"""
    
    print("🗄️  Criando tabelas...")
    Base.metadata.create_all(bind=engine)
    print("✅ Tabelas criadas")
    
    db = SessionLocal()
    
    try:
        # Verificar se admin já existe
        admin = db.query(Usuario).filter(Usuario.username == "admin").first()
        if not admin:
            print("👤 Criando usuário admin...")
            admin = Usuario(
                username="admin",
                email="admin@orderflow.local",
                hashed_password=get_password_hash("admin123"),
                is_admin=True,
                is_active=True
            )
            db.add(admin)
            db.commit()
            print("✅ Usuário admin criado")
        else:
            print("ℹ️  Usuário admin já existe")
        
        # Verificar se já existem produtos
        produtos_count = db.query(Produto).count()
        if produtos_count == 0:
            print("📦 Criando produtos de exemplo...")
            
            produtos_exemplo = [
                Produto(
                    codigo_interno="001",
                    descricao="Refrigerante 2L",
                    preco_custo=3.50,
                    preco_venda=7.90,
                    estoque_atual=50,
                    unidade_medida="UN",
                    ncm="22021000"
                ),
                Produto(
                    codigo_interno="002",
                    descricao="Água Mineral 1.5L",
                    preco_custo=0.50,
                    preco_venda=2.00,
                    estoque_atual=100,
                    unidade_medida="UN",
                    ncm="22011000"
                ),
                Produto(
                    codigo_interno="003",
                    descricao="Salgadinho 40g",
                    preco_custo=1.20,
                    preco_venda=3.50,
                    estoque_atual=75,
                    unidade_medida="UN",
                    ncm="19052000"
                ),
                Produto(
                    codigo_interno="004",
                    descricao="Hambúrguer",
                    preco_custo=8.00,
                    preco_venda=18.00,
                    estoque_atual=30,
                    unidade_medida="UN",
                    ncm="21069090"
                ),
                Produto(
                    codigo_interno="005",
                    descricao="Porção de Batata Frita",
                    preco_custo=3.00,
                    preco_venda=12.00,
                    estoque_atual=40,
                    unidade_medida="UN",
                    ncm="20041000"
                ),
                Produto(
                    codigo_interno="006",
                    descricao="Pizza Grande",
                    preco_custo=12.00,
                    preco_venda=35.00,
                    estoque_atual=20,
                    unidade_medida="UN",
                    ncm="19052000"
                ),
                Produto(
                    codigo_interno="007",
                    descricao="Cerveja 350ml",
                    preco_custo=2.50,
                    preco_venda=8.00,
                    estoque_atual=60,
                    unidade_medida="UN",
                    ncm="22030010"
                ),
                Produto(
                    codigo_interno="008",
                    descricao="Suco Natural",
                    preco_custo=2.00,
                    preco_venda=8.00,
                    estoque_atual=45,
                    unidade_medida="UN",
                    ncm="20099000"
                ),
            ]
            
            for produto in produtos_exemplo:
                db.add(produto)
            
            db.commit()
            print(f"✅ {len(produtos_exemplo)} produtos criados")
        else:
            print(f"ℹ️  {produtos_count} produtos já existem")
        
        print("\n✅ Inicialização concluída!")
        print("\n📊 Resumo:")
        print(f"  - Usuários: {db.query(Usuario).count()}")
        print(f"  - Produtos: {db.query(Produto).count()}")
        
    except Exception as e:
        print(f"❌ Erro ao inicializar: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    print("🚀 Inicializando banco de dados Order Flow...")
    print("=" * 50)
    init_database()
    print("=" * 50)
    print("\n✨ Banco pronto para uso!")
    print("Acesse http://localhost:3000 e faça login com:")
    print("  Username: admin")
    print("  Password: admin123")
