"""
Script de migração para adicionar novas colunas ao banco de dados
Execute este script para atualizar o banco de dados existente:
    python backend/migrate_db.py
"""

import sys
sys.path.insert(0, 'backend')

from sqlalchemy import create_engine, text
from app.core.config import settings
from app.core.database import Base

def run_migration():
    """Executa a migração do banco de dados"""
    
    # Criar engine
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Verificar se as colunas já existem
        try:
            # Verificar coluna vender_sem_estoque
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = 'produtos' AND column_name = 'vender_sem_estoque'"
            )).fetchone()
            
            if result[0] == 0:
                print("Adicionando coluna 'vender_sem_estoque' na tabela 'produtos'...")
                conn.execute(text(
                    "ALTER TABLE produtos ADD COLUMN vender_sem_estoque INTEGER NOT NULL DEFAULT 0"
                ))
                print("Coluna 'vender_sem_estoque' adicionada com sucesso!")
            else:
                print("Coluna 'vender_sem_estoque' já existe.")
            
            # Verificar coluna valor_frete
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = 'vendas' AND column_name = 'valor_frete'"
            )).fetchone()
            
            if result[0] == 0:
                print("Adicionando coluna 'valor_frete' na tabela 'vendas'...")
                conn.execute(text(
                    "ALTER TABLE vendas ADD COLUMN valor_frete NUMERIC(10,2) DEFAULT 0"
                ))
                print("Coluna 'valor_frete' adicionada com sucesso!")
            else:
                print("Coluna 'valor_frete' já existe.")
            
            conn.commit()
            print("\n✅ Migração concluída com sucesso!")
            
        except Exception as e:
            print(f"\n❌ Erro na migração: {e}")
            conn.rollback()
            sys.exit(1)

if __name__ == "__main__":
    print("🔄 Iniciando migração do banco de dados...")
    run_migration()