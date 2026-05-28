#!/usr/bin/env python3
"""Script para inicializar o banco de dados"""

import sys
import os
from pathlib import Path
import time

# Adicionar diretório ao path
sys.path.insert(0, str(Path(__file__).parent))

# IMPORTANTE: Importar os modelos ANTES de criar as tabelas
from app.core.database import Base, engine
from app.models.usuario import Usuario
from app.models.produto import Produto
from app.models.venda import Venda
from app.models.item_venda import ItemVenda
from sqlalchemy import text, inspect

def init_db():
    """Inicializa o banco de dados criando todas as tabelas"""
    try:
        print("🔄 Conectando ao banco de dados...")
        
        # Tentar conexão com retry
        max_retries = 30
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                with engine.connect() as connection:
                    connection.execute(text("SELECT 1"))
                    print("✅ Conexão com banco de dados estabelecida!")
                    break
            except Exception as e:
                retry_count += 1
                if retry_count < max_retries:
                    print(f"⏳ Tentativa {retry_count}/{max_retries}. Aguardando 1 segundo...")
                    time.sleep(1)
                else:
                    raise Exception("Não foi possível conectar ao banco de dados após múltiplas tentativas")
        
        print("🔄 Criando tabelas...")
        Base.metadata.create_all(bind=engine)
        
        # Verificar tabelas criadas
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        print(f"✅ Tabelas criadas: {tables}")
        print("✅ Banco de dados inicializado com sucesso!")
        
    except Exception as e:
        print(f"❌ Erro ao inicializar banco de dados: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    init_db()

