"""add cascade delete on itens_venda

Revision ID: 002
Revises: 001
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    # Drop the old foreign key constraint
    op.drop_constraint('itens_venda_produto_id_fkey', 'itens_venda', type_='foreignkey')
    
    # Create new foreign key constraint with ON DELETE CASCADE
    op.create_foreign_key(
        'itens_venda_produto_id_fkey',
        'itens_venda',
        'produtos',
        ['produto_id'],
        ['id'],
        ondelete='CASCADE'
    )


def downgrade():
    # Drop the cascade foreign key constraint
    op.drop_constraint('itens_venda_produto_id_fkey', 'itens_venda', type_='foreignkey')
    
    # Recreate the original foreign key constraint without CASCADE
    op.create_foreign_key(
        'itens_venda_produto_id_fkey',
        'itens_venda',
        'produtos',
        ['produto_id'],
        ['id']
    )