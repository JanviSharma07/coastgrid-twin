"""Entry point for Vercel (serverless). Vercel looks for `app` in index.py.

Locally you can keep using:  uvicorn app.main:app --reload
"""
from app.main import app  # noqa: F401
