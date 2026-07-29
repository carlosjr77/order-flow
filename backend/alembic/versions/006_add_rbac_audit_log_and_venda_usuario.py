"""add_rbac_audit_log_and_venda_usuario

Revision ID: 006
Revises: 005
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Criar tabela de auditoria
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('acao', sa.String(length=50), nullable=False),
        sa.Column('entidade', sa.String(length=50), nullable=False),
        sa.Column('entidade_id', sa.String(length=50), nullable=True),
        sa.Column('descricao', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('user_name', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_acao'), 'audit_logs', ['acao'], unique=False)
    op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_audit_logs_entidade'), 'audit_logs', ['entidade'], unique=False)
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)
    
    # Adicionar coluna usuario_id na tabela vendas
    op.add_column('vendas', sa.Column('usuario_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_vendas_usuario_id'), 'vendas', ['usuario_id'], unique=False)
    op.create_foreign_key(
        op.f('fk_vendas_usuario_id_usuarios'),
        'vendas',
        'usuarios',
        ['usuario_id'],
        ['id']
    )
    
    # Converter campo is_admin (boolean) para perfil (string)
    # Adicionar coluna perfil
    op.add_column('usuarios', sa.Column('perfil', sa.String(length=20), nullable=True))
    op.create_index(op.f('ix_usuarios_perfil'), 'usuarios', ['perfil'], unique=False)
    
    # Migrar dados: is_admin=True -> perfil='admin', is_admin=False -> perfil='operador'
    op.execute("UPDATE usuarios SET perfil = 'admin' WHERE is_admin = TRUE OR is_admin = 1")
    op.execute("UPDATE usuarios SET perfil = 'operador' WHERE perfil IS NULL")
    
    # Definir default e not null
    op.alter_column('usuarios', 'perfil',
                    existing_type=sa.String(length=20),
                    nullable=False,
                    server_default='operador')
    
    # Adicionar coluna nome aos usuários
    op.add_column('usuarios', sa.Column('nome', sa.String(length=100), nullable=True))


def downgrade() -> None:
    # Reverter alterações na tabela usuarios
    op.drop_column('usuarios', 'nome')
    op.drop_index(op.f('ix_usuarios_perfil'), table_name='usuarios')
    op.drop_column('usuarios', 'perfil')
    
    # Reverter alterações na tabela vendas
    op.drop_constraint(op.f('fk_vendas_usuario_id_usuarios'), 'vendas', type_='foreignkey')
    op.drop_index(op.f('ix_vendas_usuario_id'), table_name='vendas')
    op.drop_column('vendas', 'usuario_id')
    
    # Remover tabela de auditoria
    op.drop_index(op.f('ix_audit_logs_user_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_entidade'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_created_at'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_acao'), table_name='audit_logs')
    op.drop_table('audit_logs')
