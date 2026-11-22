"""add_produto_custo_historico

Revision ID: 010
Revises: 009
Create Date: 2026-11-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'produto_custo_historico',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('produto_id', sa.Integer(), nullable=False),
        sa.Column('custo_anterior', sa.Numeric(10, 2), nullable=False),
        sa.Column('custo_novo', sa.Numeric(10, 2), nullable=False),
        sa.Column('origem', sa.String(length=20), nullable=False, server_default='manual'),
        sa.Column('observacao', sa.String(length=255), nullable=True),
        sa.Column('usuario_id', sa.Integer(), nullable=True),
        sa.Column('usuario_nome', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['produto_id'], ['produtos.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_produto_custo_historico_produto_id'), 'produto_custo_historico', ['produto_id'])
    op.create_index(op.f('ix_produto_custo_historico_created_at'), 'produto_custo_historico', ['created_at'])


def downgrade():
    op.drop_index(op.f('ix_produto_custo_historico_created_at'), table_name='produto_custo_historico')
    op.drop_index(op.f('ix_produto_custo_historico_produto_id'), table_name='produto_custo_historico')
    op.drop_table('produto_custo_historico')
