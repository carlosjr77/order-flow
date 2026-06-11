"""add deleted_at to vendas and itens_venda

Revision ID: 003
Revises: 002
Create Date: 2024-01-15

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Adicionar coluna deleted_at na tabela vendas
    op.add_column('vendas', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    
    # Adicionar coluna deleted_at na tabela itens_venda
    op.add_column('itens_venda', sa.Column('deleted_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    # Remover coluna deleted_at da tabela itens_venda
    op.drop_column('itens_venda', 'deleted_at')
    
    # Remover coluna deleted_at da tabela vendas
    op.drop_column('vendas', 'deleted_at')