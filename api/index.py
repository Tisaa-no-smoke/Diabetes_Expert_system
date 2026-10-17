"""Vercel serverless entry point: exposes the Flask API as `app`.

vercel.json rewrites /api/* (and /health) here; the original path is kept, so
the Flask routes match exactly as they do locally.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import create_app  # noqa: E402

app = create_app()
