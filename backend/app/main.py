"""CoastGrid Twin API entry point.

Run locally (from the backend folder):
    uvicorn app.main:app --reload
Then open http://127.0.0.1:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .api import router
from .config import APP_VERSION, settings
from .db import init_db

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="CoastGrid Twin API",
    version=APP_VERSION,
    description="Digital twin for climate-resilient coastal power grids — Team TwinVolt. "
                "Flood timeline, heat and salt stress, risk scores and recommendations for every power asset.",
)
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins or ["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(router)


@app.get("/", include_in_schema=False)
def root():
    return {"name": "CoastGrid Twin API", "version": APP_VERSION, "docs": "/docs", "health": "/api/health"}
