"""add_custo_unitario_to_itens_venda

Revision ID: 011
Revises: 010
Create Date: 2026-11-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '011'
down_revision = '010'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('itens_venda', sa.Column('custo_unitario', sa.Numeric(10, 2), nullable=True))


def downgrade():
    op.drop_column('itens_venda', 'custo_unitario')
