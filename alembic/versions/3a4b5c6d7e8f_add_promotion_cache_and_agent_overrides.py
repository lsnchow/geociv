"""add promotion_cache and agent_overrides tables

Revision ID: 3a4b5c6d7e8f
Revises: 2243ee8e39aa
Create Date: 2026-01-24 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '3a4b5c6d7e8f'
down_revision: Union[str, None] = '2243ee8e39aa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create promotion_cache table
    op.create_table(
        'promotion_cache',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('scenario_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('scenarios.id', ondelete='CASCADE'), nullable=False),
        sa.Column('cache_key', sa.String(64), nullable=False, index=True),
        sa.Column('inputs_json', sa.JSON(), nullable=False),
        sa.Column('result_json', sa.JSON(), nullable=False),
        sa.Column('provider_mix', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # Create composite index for fast cache lookups
    op.create_index(
        'ix_promotion_cache_scenario_key',
        'promotion_cache',
        ['scenario_id', 'cache_key']
    )
    
    # Create agent_overrides table
    op.create_table(
        'agent_overrides',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('scenario_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('scenarios.id', ondelete='CASCADE'), nullable=False),
        sa.Column('agent_key', sa.String(100), nullable=False),
        sa.Column('model', sa.String(100), nullable=True),
        sa.Column('archetype_override', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # Unique constraint: one override per agent per scenario
    op.create_unique_constraint(
        'uq_agent_override_scenario_agent',
        'agent_overrides',
        ['scenario_id', 'agent_key']
    )
    
    # Index for querying by scenario
    op.create_index(
        'ix_agent_overrides_scenario',
        'agent_overrides',
        ['scenario_id']
    )


def downgrade() -> None:
    # Drop agent_overrides
    op.drop_index('ix_agent_overrides_scenario', table_name='agent_overrides')
    op.drop_constraint('uq_agent_override_scenario_agent', 'agent_overrides', type_='unique')
    op.drop_table('agent_overrides')
    
    # Drop promotion_cache
    op.drop_index('ix_promotion_cache_scenario_key', table_name='promotion_cache')
    op.drop_index('ix_promotion_cache_cache_key', table_name='promotion_cache')
    op.drop_table('promotion_cache')
