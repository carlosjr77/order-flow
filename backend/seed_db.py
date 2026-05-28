#!/usr/bin/env python3
"""Script para popular o banco com dados iniciais (usuário admin)"""

import sys
import os
from pathlib import Path
import time

# Adicionar diretório ao path
sys.path.insert(0, str(Path(__file__).parent))

# IMPORTANTE: Importar os modelos ANTES de verificar tabelas
from app.core.database import SessionLocal, Base, engine
from app.core.security import get_password_hash
from app.models.usuario import Usuario
from app.models.produto import Produto
from app.models.venda import Venda
from app.models.item_venda import ItemVenda
from sqlalchemy import text, inspect

def seed_db():
    """Popula o banco com dados iniciais"""
    try:
        print("⏳ Aguardando tabelas serem criadas...")
        max_retries = 30
        retry_count = 0
        table_exists = False
        
        while retry_count < max_retries:
            try:
                inspector = inspect(engine)
                tables = inspector.get_table_names()
                
                if 'usuarios' in tables:
                    print(f"✅ Tabelas encontradas: {tables}")
                    table_exists = True
                    break
                else:
                    retry_count += 1
                    if retry_count < max_retries:
                        print(f"⏳ Tabela 'usuarios' não encontrada... ({retry_count}/{max_retries})")
                        time.sleep(1)
            except Exception as e:
                retry_count += 1
                if retry_count < max_retries:
                    print(f"⏳ Verificando tabelas... ({retry_count}/{max_retries}). Erro: {str(e)[:50]}")
                    time.sleep(1)
                else:
                    raise Exception(f"Erro ao verificar tabelas após múltiplas tentativas: {e}")
        
        if not table_exists:
            raise Exception("Tabela 'usuarios' não foi criada após múltiplas tentativas")
        
        db = SessionLocal()
        
        # Verificar se o usuário admin já existe
        admin = db.query(Usuario).filter(Usuario.username == "admin").first()
        
        if admin:
            print("✅ Usuário admin já existe")
        else:
            print("🔄 Criando usuário admin...")
            
            admin_user = Usuario(
                username="admin",
                email="admin@orderflow.com",
                hashed_password=get_password_hash("admin123"),
                is_active=True,
                is_admin=True
            )
            
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            print(f"✅ Usuário admin criado com sucesso (ID: {admin_user.id})")
        
        db.close()
        print("✅ Seed do banco de dados concluído!")
        
    except Exception as e:
        print(f"❌ Erro ao fazer seed do banco: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    seed_db()
