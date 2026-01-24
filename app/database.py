"""Database configuration and session management."""

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


def _normalize_db_url(url: str) -> str:
    """
    Guard against bad query params that asyncpg rejects.
    - Convert any `sslmode` to `ssl=true`.
    - Default to `ssl=true` if neither param is present.
    """
    split = urlsplit(url)
    query = dict(parse_qsl(split.query, keep_blank_values=True))

    if "sslmode" in query:
        sslmode = query.pop("sslmode")
        # map common sslmode settings to ssl boolean
        if sslmode.lower() == "disable":
            query.setdefault("ssl", "false")
        else:
            query.setdefault("ssl", "true")

    query.setdefault("ssl", "true")

    new_query = urlencode(query)
    return urlunsplit(
        (
            split.scheme,
            split.netloc,
            split.path,
            new_query,
            split.fragment,
        )
    )


settings = get_settings()

engine = create_async_engine(
    _normalize_db_url(settings.database_url),
    echo=settings.debug,
    future=True,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """Dependency to get database session."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
