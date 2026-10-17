"""Single-service deployment: the API serves the built website and sits behind a proxy."""

import pytest

from app import create_app
from app.config import Config


def _make_app(tmp_path, **overrides):
    class DeployConfig(Config):
        TESTING = True
        SECRET_KEY = "deploy-test-secret-key-0123456789"
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmp_path}/deploy.db"
        DB_AUTO_CREATE = True
        SEED_DEMO_DATA = True
        DB_FALLBACK_ENABLED = False

    for key, value in overrides.items():
        setattr(DeployConfig, key, value)
    return create_app(DeployConfig)


@pytest.fixture()
def site(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><div id=root></div>")
    (dist / "assets" / "index-abc123.js").write_text("console.log('app')")
    (dist / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("do not serve")
    return _make_app(tmp_path, FRONTEND_DIST_DIR=str(dist)).test_client()


def test_root_and_client_routes_load_the_app_shell(site):
    for path in ["/", "/dashboard", "/patients/12", "/login?next=/review"]:
        response = site.get(path)
        assert response.status_code == 200, path
        assert b"<div id=root>" in response.data
        assert response.headers["Cache-Control"] == "no-cache"


def test_fingerprinted_assets_are_cached_and_other_files_served(site):
    asset = site.get("/assets/index-abc123.js")
    assert asset.status_code == 200
    assert asset.headers["Cache-Control"] == "public, max-age=31536000, immutable"
    assert site.get("/favicon.svg").data == b"<svg/>"


def test_api_routes_are_not_swallowed_by_the_website(site):
    assert site.get("/api/health").get_json()["data"]["status"] == "ok"
    missing = site.get("/api/no-such-endpoint")
    assert missing.status_code == 404
    assert missing.get_json()["success"] is False


def test_files_outside_the_build_folder_are_not_served(site):
    for path in ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt"]:
        response = site.get(path)
        assert b"do not serve" not in response.data, path


def test_without_a_build_the_root_keeps_the_backend_start_page(tmp_path):
    client = _make_app(tmp_path).test_client()
    assert client.get("/").status_code == 302


def test_rate_limits_apply_per_visitor_behind_a_proxy(tmp_path):
    client = _make_app(tmp_path, TRUSTED_PROXY_COUNT=1).test_client()

    def login(ip):
        return client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "wrong-password"},
            headers={"X-Forwarded-For": ip},
        )

    statuses = [login("203.0.113.10").status_code for _ in range(11)]
    assert statuses[-1] == 429
    # A different visitor behind the same proxy is not affected.
    assert login("198.51.100.20").status_code == 401
