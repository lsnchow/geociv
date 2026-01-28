"""Database configuration and session management."""

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import ssl
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


def _normalize_db_url(url: str):
    """
    Guard against bad query params that asyncpg rejects.
    Return a tuple: (url_without_query, ssl_bool)
    """
    split = urlsplit(url)
    query = dict(parse_qsl(split.query, keep_blank_values=True))

    ssl_val = query.get("ssl") or None

    if "sslmode" in query:
        sslmode = query.pop("sslmode")
        ssl_val = "false" if sslmode.lower() == "disable" else "true"

    if ssl_val is None:
        ssl_val = "true"

    # strip all query params from the URL to avoid passing unknown args
    bare_url = urlunsplit(
        (
            split.scheme,
            split.netloc,
            split.path,
            "",
            split.fragment,
        )
    )

    ssl_bool = str(ssl_val).lower() in ("true", "1", "yes", "require", "verify-ca", "verify-full")
    return bare_url, ssl_bool


settings = get_settings()

bare_url, ssl_enabled = _normalize_db_url(settings.database_url)
print(f"[DB] Using URL: {bare_url} | ssl={ssl_enabled}")

connect_kwargs = {}
if ssl_enabled:
    ctx = ssl.create_default_context()
    # Supabase pooler certs sometimes present as shared ELB; loosen hostname/CN for connectivity
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    connect_kwargs["ssl"] = ctx

engine = create_async_engine(
    bare_url,
    echo=settings.debug,
    future=True,
    connect_args=connect_kwargs,
    # Revalidate stale connections dropped by the provider (e.g., Supabase/Heroku poolers)
    pool_pre_ping=True,
    # Force connection recycle to avoid long-idle sockets being closed server-side
    pool_recycle=900,
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
