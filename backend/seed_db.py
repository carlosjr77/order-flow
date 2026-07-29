#!/usr/bin/env python3
"""Script para popular o banco com dados iniciais e fazer upgrade do usuário existente para admin"""

import sys
import os
from pathlib import Path
import time

# Adicionar diretório ao path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import text, inspect
from app.core.database import SessionLocal, Base, engine
from app.core.security import get_password_hash
from app.core.config import settings
from app.models.usuario import Usuario
from app.models.produto import Produto
from app.models.venda import Venda
from app.models.item_venda import ItemVenda
from app.models.audit_log import AuditLog


def wait_for_tables(max_retries: int = 30) -> bool:
    """Aguarda as tabelas serem criadas no banco"""
    retry_count = 0
    while retry_count < max_retries:
        try:
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            if 'usuarios' in tables:
                print(f"✅ Tabelas encontradas: {tables}")
                return True
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
    return False


def ensure_migration_columns():
    """Garante que as colunas necessárias existam para a migration de RBAC"""
    try:
        with engine.connect() as conn:
            # Verificar se a coluna perfil existe em usuarios
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = 'usuarios' AND column_name = 'perfil'"
            )).fetchone()
            
            if result[0] == 0:
                print("🔧 Adicionando coluna 'perfil' na tabela 'usuarios'...")
                conn.execute(text(
                    "ALTER TABLE usuarios ADD COLUMN perfil VARCHAR(20) DEFAULT 'operador'"
                ))
                conn.commit()
                print("✅ Coluna 'perfil' adicionada!")
            else:
                print("ℹ️ Coluna 'perfil' já existe.")
            
            # Verificar se a coluna nome existe em usuarios
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = 'usuarios' AND column_name = 'nome'"
            )).fetchone()
            
            if result[0] == 0:
                print("🔧 Adicionando coluna 'nome' na tabela 'usuarios'...")
                conn.execute(text(
                    "ALTER TABLE usuarios ADD COLUMN nome VARCHAR(100)"
                ))
                conn.commit()
                print("✅ Coluna 'nome' adicionada!")
            else:
                print("ℹ️ Coluna 'nome' já existe.")
            
            # Verificar se a coluna usuario_id existe em vendas
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = 'vendas' AND column_name = 'usuario_id'"
            )).fetchone()
            
            if result[0] == 0:
                print("🔧 Adicionando coluna 'usuario_id' na tabela 'vendas'...")
                conn.execute(text(
                    "ALTER TABLE vendas ADD COLUMN usuario_id INTEGER"
                ))
                conn.commit()
                print("✅ Coluna 'usuario_id' adicionada!")
            else:
                print("ℹ️ Coluna 'usuario_id' já existe.")
            
            # Verificar se a tabela audit_logs existe
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_name = 'audit_logs'"
            )).fetchone()
            
            if result[0] == 0:
                print("🔧 Criando tabela 'audit_logs'...")
                conn.execute(text("""
                    CREATE TABLE audit_logs (
                        id SERIAL PRIMARY KEY,
                        acao VARCHAR(50) NOT NULL,
                        entidade VARCHAR(50) NOT NULL,
                        entidade_id VARCHAR(50),
                        descricao TEXT,
                        ip_address VARCHAR(45),
                        user_id INTEGER,
                        user_name VARCHAR(50),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.execute(text("CREATE INDEX idx_audit_logs_acao ON audit_logs(acao)"))
                conn.execute(text("CREATE INDEX idx_audit_logs_entidade ON audit_logs(entidade)"))
                conn.execute(text("CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id)"))
                conn.execute(text("CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at)"))
                conn.commit()
                print("✅ Tabela 'audit_logs' criada!")
            else:
                print("ℹ️ Tabela 'audit_logs' já existe.")
                
    except Exception as e:
        print(f"⚠️ Erro ao garantir colunas de migration: {e}")
        raise


def migrate_legacy_admin_flag():
    """Migra o campo booleano is_admin antigo para o novo campo perfil"""
    try:
        with engine.connect() as conn:
            # Verificar se a coluna is_admin ainda existe
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = 'usuarios' AND column_name = 'is_admin'"
            )).fetchone()
            
            if result[0] > 0:
                print("🔄 Migrando campo is_admin para perfil...")
                conn.execute(text(
                    "UPDATE usuarios SET perfil = 'admin' WHERE is_admin = TRUE"
                ))
                conn.execute(text(
                    "UPDATE usuarios SET perfil = 'operador' WHERE perfil IS NULL"
                ))
                conn.commit()
                print("✅ Migração de is_admin para perfil concluída!")
    except Exception as e:
        print(f"⚠️ Erro na migração de is_admin: {e}")


def seed_admin_user():
    """Cria ou atualiza o usuário administrador padrão"""
    db = SessionLocal()
    try:
        admin_username = settings.ADMIN_USERNAME
        admin_password = settings.ADMIN_PASSWORD
        
        print(f"🔄 Verificando usuário admin '{admin_username}'...")
        
        # Buscar usuário existente pelo username configurado
        admin = db.query(Usuario).filter(Usuario.username == admin_username).first()
        
        if admin:
            print(f"🔄 Usuário '{admin_username}' encontrado. Atualizando para admin e redefinindo senha...")
            admin.perfil = "admin"
            admin.is_active = True
            admin.hashed_password = get_password_hash(admin_password)
            db.commit()
            db.refresh(admin)
            print(f"✅ Usuário '{admin_username}' atualizado para admin com nova senha")
        else:
            # Se não encontrou pelo username, tenta encontrar o primeiro usuário existente
            print("🔍 Usuário admin não encontrado pelo username. Procurando usuário existente...")
            primeiro_usuario = db.query(Usuario).order_by(Usuario.id.asc()).first()
            
            if primeiro_usuario:
                print(f"🔄 Transformando usuário existente '{primeiro_usuario.username}' em admin...")
                primeiro_usuario.perfil = "admin"
                primeiro_usuario.is_active = True
                primeiro_usuario.hashed_password = get_password_hash(admin_password)
                db.commit()
                db.refresh(primeiro_usuario)
                print(f"✅ Usuário existente '{primeiro_usuario.username}' transformado em admin")
            else:
                # Criar novo usuário admin se não existe nenhum
                print("🔄 Nenhum usuário encontrado. Criando novo usuário admin...")
                novo_admin = Usuario(
                    username=admin_username,
                    email=f"{admin_username}@orderflow.com",
                    nome="Administrador",
                    hashed_password=get_password_hash(admin_password),
                    is_active=True,
                    perfil="admin"
                )
                db.add(novo_admin)
                db.commit()
                db.refresh(novo_admin)
                print(f"✅ Novo usuário admin criado (ID: {novo_admin.id})")
        
        # Garantir que existe pelo menos um admin ativo
        admin_ativo = db.query(Usuario).filter(
            Usuario.perfil == "admin",
            Usuario.is_active == True
        ).first()
        
        if not admin_ativo:
            print("⚠️ Nenhum admin ativo encontrado. Criando admin padrão...")
            admin_padrao = Usuario(
                username="admin",
                email="admin@orderflow.com",
                nome="Administrador",
                hashed_password=get_password_hash(admin_password),
                is_active=True,
                perfil="admin"
            )
            db.add(admin_padrao)
            db.commit()
            print(f"✅ Admin padrão criado (ID: {admin_padrao.id})")
        
    except Exception as e:
        print(f"❌ Erro ao criar/atualizar admin: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def seed_db():
    """Popula o banco com dados iniciais e faz upgrade do usuário existente"""
    try:
        print("🔄 Inicializando seed do banco de dados...")
        
        # Criar tabelas
        print("🔄 Criando tabelas...")
        Base.metadata.create_all(bind=engine)
        
        # Aguardar tabelas
        if not wait_for_tables():
            raise Exception("Tabela 'usuarios' não foi criada após múltiplas tentativas")
        
        # Garantir colunas de migration
        ensure_migration_columns()
        
        # Migrar flag is_admin antiga
        migrate_legacy_admin_flag()
        
        # Criar/atualizar usuário admin
        seed_admin_user()
        
        print("✅ Seed do banco de dados concluído!")
        
    except Exception as e:
        print(f"❌ Erro ao fazer seed do banco: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    seed_db()
