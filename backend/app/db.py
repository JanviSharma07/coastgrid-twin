"""Database connection and table definitions (SQLAlchemy 2).

Works with SQLite (local) and PostgreSQL (Supabase). Geometry is stored as
latitude/longitude columns and GeoJSON text, so no database extension is required.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (Float, ForeignKey, Index, Integer, String, Text, DateTime,
                        create_engine, inspect, JSON)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import settings


def _make_engine():
    url = settings.database_url.strip()  # pasted values often carry a trailing newline
    if url.startswith("postgres://"):  # Supabase sometimes shows this older prefix
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    kwargs = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        # Serverless (Vercel): don't hold idle connections, so the free Supabase pooler isn't exhausted.
        # prepare_threshold=None also makes it work with Supabase's transaction pooler (port 6543).
        from sqlalchemy.pool import NullPool
        kwargs["poolclass"] = NullPool
        kwargs["connect_args"] = {"prepare_threshold": None}
    return create_engine(url, **kwargs)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # e.g. "osm-way-123"
    region: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(32))  # substation | power_plant | solar | battery
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    voltage_kv: Mapped[float | None] = mapped_column(Float, nullable=True)
    operator: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ground_elev_m: Mapped[float] = mapped_column(Float)
    base_elev_m: Mapped[float] = mapped_column(Float)
    dist_coast_km: Mapped[float] = mapped_column(Float)
    hospitals_nearby: Mapped[int] = mapped_column(Integer, default=0)
    criticality: Mapped[float] = mapped_column(Float)
    subsidence_mm_yr: Mapped[float] = mapped_column(Float, default=0.0)
    source: Mapped[str] = mapped_column(String(32), default="openstreetmap")


class RiskResult(Base):
    __tablename__ = "risk_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[str] = mapped_column(String(64), ForeignKey("assets.id", ondelete="CASCADE"))
    region: Mapped[str] = mapped_column(String(32))
    scenario: Mapped[str] = mapped_column(String(16))
    year: Mapped[int] = mapped_column(Integer)
    surge_m: Mapped[float] = mapped_column(Float)
    water_level_m: Mapped[float] = mapped_column(Float)
    margin_m: Mapped[float] = mapped_column(Float)
    flood_score: Mapped[float] = mapped_column(Float)
    heat_score: Mapped[float] = mapped_column(Float)
    salt_score: Mapped[float] = mapped_column(Float)
    risk_score: Mapped[float] = mapped_column(Float)
    risk_level: Mapped[str] = mapped_column(String(8))
    flood_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    main_threat: Mapped[str] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(200))

    __table_args__ = (Index("ix_risk_lookup", "region", "scenario", "year", "surge_m"),)


class SeaLevel(Base):
    __tablename__ = "sea_level"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    region: Mapped[str] = mapped_column(String(32), index=True)
    scenario: Mapped[str] = mapped_column(String(16))
    year: Mapped[int] = mapped_column(Integer)
    p17: Mapped[float] = mapped_column(Float)
    p50: Mapped[float] = mapped_column(Float)
    p83: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(200))


class FloodZone(Base):
    __tablename__ = "flood_zones"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    region: Mapped[str] = mapped_column(String(32))
    scenario: Mapped[str] = mapped_column(String(16))
    year: Mapped[int] = mapped_column(Integer)
    surge_m: Mapped[float] = mapped_column(Float)
    area_km2: Mapped[float] = mapped_column(Float)
    geojson: Mapped[str] = mapped_column(Text)

    __table_args__ = (Index("ix_flood_lookup", "region", "scenario", "year", "surge_m"),)


class SafeSite(Base):
    __tablename__ = "safe_sites"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    region: Mapped[str] = mapped_column(String(32))
    scenario: Mapped[str] = mapped_column(String(16))
    rank: Mapped[int] = mapped_column(Integer)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    ground_elev_m: Mapped[float] = mapped_column(Float)
    margin_2100_m: Mapped[float] = mapped_column(Float)
    dist_coast_km: Mapped[float] = mapped_column(Float)
    nearest_substation_km: Mapped[float] = mapped_column(Float)
    score: Mapped[float] = mapped_column(Float)


class RegionData(Base):
    """Per-region blobs: elevation grid, ocean/climate conditions, coastline."""
    __tablename__ = "region_data"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    region: Mapped[str] = mapped_column(String(32))
    key: Mapped[str] = mapped_column(String(32))  # "grid" | "ocean" | "coastline"
    data: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (Index("ix_region_key", "region", "key", unique=True),)


SCHEMA_CHECK = {"risk_results": "surge_m", "flood_zones": "surge_m"}


def init_db(reset_if_outdated: bool = False) -> None:
    """Create tables. If an older table layout is found, rebuild the tables (pipeline only)."""
    if reset_if_outdated:
        insp = inspect(engine)
        for table, col in SCHEMA_CHECK.items():
            if insp.has_table(table) and col not in {c["name"] for c in insp.get_columns(table)}:
                Base.metadata.drop_all(engine)
                break
    Base.metadata.create_all(engine)
