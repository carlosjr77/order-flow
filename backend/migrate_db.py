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
            
            # Verificar coluna margem_lucro em produtos
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = 'produtos' AND column_name = 'margem_lucro'"
            )).fetchone()
            
            if result[0] == 0:
                print("Adicionando coluna 'margem_lucro' na tabela 'produtos'...")
                conn.execute(text(
                    "ALTER TABLE produtos ADD COLUMN margem_lucro FLOAT"
                ))
                print("Coluna 'margem_lucro' adicionada com sucesso!")
            else:
                print("Coluna 'margem_lucro' já existe.")
            
            # Verificar coluna margem_lucro_padrao em empresas
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = 'empresas' AND column_name = 'margem_lucro_padrao'"
            )).fetchone()
            
            if result[0] == 0:
                print("Adicionando coluna 'margem_lucro_padrao' na tabela 'empresas'...")
                conn.execute(text(
                    "ALTER TABLE empresas ADD COLUMN margem_lucro_padrao FLOAT DEFAULT 1.0"
                ))
                print("Coluna 'margem_lucro_padrao' adicionada com sucesso!")
            else:
                print("Coluna 'margem_lucro_padrao' já existe.")
            
            # Atualizar restrição de chave estrangeira em itens_venda para CASCADE
            print("Verificando restrição de chave estrangeira em itens_venda...")
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.table_constraints "
                "WHERE constraint_name = 'itens_venda_produto_id_fkey' AND table_name = 'itens_venda'"
            )).fetchone()
            
            if result[0] > 0:
                # Verificar se já tem ON DELETE CASCADE
                result_cascade = conn.execute(text(
                    "SELECT delete_rule FROM information_schema.referential_constraints "
                    "WHERE constraint_name = 'itens_venda_produto_id_fkey'"
                )).fetchone()
                
                if result_cascade and result_cascade[0] != 'CASCADE':
                    print("Atualizando restrição de chave estrangeira em itens_venda para CASCADE...")
                    # Drop da restrição antiga
                    conn.execute(text(
                        "ALTER TABLE itens_venda DROP CONSTRAINT itens_venda_produto_id_fkey"
                    ))
                    # Criação da nova restrição com CASCADE
                    conn.execute(text(
                        "ALTER TABLE itens_venda ADD CONSTRAINT itens_venda_produto_id_fkey "
                        "FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE"
                    ))
                    print("Restrição atualizada para CASCADE com sucesso!")
                elif result_cascade and result_cascade[0] == 'CASCADE':
                    print("Restrição de chave estrangeira já está com CASCADE.")
                else:
                    print("Restrição de chave estrangeira não encontrada em referential_constraints.")
            else:
                print("Restrição de chave estrangeira 'itens_venda_produto_id_fkey' não encontrada.")
            
            conn.commit()
            print("\n✅ Migração concluída com sucesso!")
            
        except Exception as e:
            print(f"\n❌ Erro na migração: {e}")
            conn.rollback()
            sys.exit(1)

if __name__ == "__main__":
    print("🔄 Iniciando migração do banco de dados...")
    run_migration()