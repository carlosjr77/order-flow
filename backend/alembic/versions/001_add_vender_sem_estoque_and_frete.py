"""add_vender_sem_estoque_and_frete

Revision ID: 001
Revises: 
Create Date: 2024-01-01

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Adicionar coluna vender_sem_estoque na tabela produtos
    op.add_column('produtos', sa.Column('vender_sem_estoque', sa.Integer(), nullable=False, server_default='0'))
    
    # Adicionar coluna valor_frete na tabela vendas
    op.add_column('vendas', sa.Column('valor_frete', sa.Numeric(10, 2), nullable=True, server_default='0'))


def downgrade() -> None:
    # Remover colunas adicionadas
    op.drop_column('vendas', 'valor_frete')
    op.drop_column('produtos', 'vender_sem_estoque')