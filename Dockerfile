# syntax=docker/dockerfile:1
#
# Single-service image: the Flask API also serves the built React website, so
# the whole app runs at one address (used by render.yaml). The backend-only
# image in backend/Dockerfile is still used by docker-compose.

# ── Website build ──
FROM node:22-alpine AS website

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# The website calls the API on the same address. The Google client ID is not
# a secret; it is baked into the bundle when provided.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_API_BASE_URL=/api \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

# ── API server ──
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# WeasyPrint native libraries and Khmer/Unicode fonts for PDF reports.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libjpeg62-turbo \
    libopenjp2-7 \
    libffi8 \
    fonts-noto-core \
    fonts-noto-cjk \
    fonts-khmeros \
    fonts-dejavu-core \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

RUN groupadd -r appgroup && useradd -r -g appgroup -d /app -s /sbin/nologin appuser
COPY --chown=appuser:appgroup backend/ ./
COPY --from=website --chown=appuser:appgroup /frontend/dist ./frontend_dist
RUN mkdir -p /app/instance && chown -R appuser:appgroup /app/instance

USER appuser

ENV FLASK_DEBUG=0 \
    FRONTEND_DIST_DIR=/app/frontend_dist \
    PORT=10000

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Apply database migrations, then serve. WEB_CONCURRENCY keeps memory within
# small instances (each worker loads the app and WeasyPrint).
CMD ["sh", "-c", "python -m flask --app 'app:create_app()' db upgrade && exec gunicorn --bind 0.0.0.0:${PORT} --workers ${WEB_CONCURRENCY:-2} --threads 4 --timeout 120 --access-logfile - --error-logfile - 'app:create_app()'"]
