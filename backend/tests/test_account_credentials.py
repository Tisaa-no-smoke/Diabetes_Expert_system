"""Self-service password and email changes for every role."""

import time

import pytest

from app.extensions import db, limiter
from app.models import User
from tests.conftest import login_and_get_auth


@pytest.fixture(autouse=True)
def _no_rate_limit(app):
    # Several tests hit the same 5-per-minute endpoint in quick succession.
    limiter.enabled = False
    yield
    limiter.enabled = True


def _headers(auth):
    return {"Authorization": f"Bearer {auth['access_token']}"}


def _change_password(client, auth, current, new):
    return client.post("/api/auth/password", headers=_headers(auth), json={"current_password": current, "new_password": new})


def _change_email(client, auth, current, new_email):
    return client.post("/api/auth/email", headers=_headers(auth), json={"current_password": current, "new_email": new_email})


@pytest.mark.parametrize(
    ("email", "password"),
    [("admin@example.com", "admin123"), ("doctor@example.com", "doctor123"), ("patient@example.com", "patient123")],
)
def test_every_role_can_change_password(client, email, password):
    auth = login_and_get_auth(client, email, password)

    response = _change_password(client, auth, password, "New-Secret-2026")

    assert response.status_code == 200, response.get_json()
    data = response.get_json()["data"]
    assert data["access_token"] and data["refresh_token"]
    assert data["user"]["email"] == email
    assert data["user"]["has_password"] is True
    # The new password signs in; the old one no longer does.
    assert client.post("/api/auth/login", json={"email": email, "password": "New-Secret-2026"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": email, "password": password}).status_code == 401


def test_password_change_signs_out_other_sessions(client):
    other_device = login_and_get_auth(client, "doctor@example.com", "doctor123")
    time.sleep(1)  # token "iat" claims are whole seconds
    this_device = login_and_get_auth(client, "doctor@example.com", "doctor123")

    response = _change_password(client, this_device, "doctor123", "New-Secret-2026")
    fresh = response.get_json()["data"]

    assert client.get("/api/auth/me", headers=_headers(other_device)).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": other_device["refresh_token"]}).status_code == 401
    # The device that made the change continues with the tokens it was given.
    assert client.get("/api/auth/me", headers=_headers(fresh)).status_code == 200
    assert client.post("/api/auth/refresh", json={"refresh_token": fresh["refresh_token"]}).status_code == 200


@pytest.mark.parametrize(
    ("current", "new", "field"),
    [
        ("wrong-password", "New-Secret-2026", "current_password"),
        ("", "New-Secret-2026", "current_password"),
        ("patient123", "short", "new_password"),
        ("patient123", "x" * 129, "new_password"),
        ("patient123", "patient123", "new_password"),
    ],
)
def test_password_change_rejections_are_form_errors(client, current, new, field):
    auth = login_and_get_auth(client, "patient@example.com", "patient123")

    response = _change_password(client, auth, current, new)

    # 400, not 401: the client signs the user out on 401.
    assert response.status_code == 400
    assert response.get_json()["error"]["details"]["field"] == field
    assert client.post("/api/auth/login", json={"email": "patient@example.com", "password": "patient123"}).status_code == 200


def test_every_role_can_change_email(client):
    for email, password in [("admin@example.com", "admin123"), ("doctor@example.com", "doctor123"), ("patient@example.com", "patient123")]:
        auth = login_and_get_auth(client, email, password)
        new_email = f"new.{email}"

        response = _change_email(client, auth, password, f"  NEW.{email.upper()} ")

        assert response.status_code == 200, response.get_json()
        assert response.get_json()["data"]["user"]["email"] == new_email
        assert client.post("/api/auth/login", json={"email": new_email, "password": password}).status_code == 200
        assert client.post("/api/auth/login", json={"email": email, "password": password}).status_code == 401


@pytest.mark.parametrize(
    ("current", "new_email", "field"),
    [
        ("wrong-password", "someone@example.com", "current_password"),
        ("patient123", "not-an-email", "new_email"),
        ("patient123", "no-domain@", "new_email"),
        ("patient123", "patient@example.com", "new_email"),
        ("patient123", "Doctor@Example.com", "new_email"),
    ],
)
def test_email_change_rejections(client, current, new_email, field):
    auth = login_and_get_auth(client, "patient@example.com", "patient123")

    response = _change_email(client, auth, current, new_email)

    assert response.status_code == 400
    assert response.get_json()["error"]["details"]["field"] == field


def test_email_change_is_audited(client, app):
    auth = login_and_get_auth(client, "doctor@example.com", "doctor123")
    _change_email(client, auth, "doctor123", "lina@clinic.example.com")

    from app.models import AuditLog

    with app.app_context():
        entry = AuditLog.query.filter_by(action="auth.email_change").order_by(AuditLog.id.desc()).first()
        assert entry is not None
        assert entry.metadata_json["previous_email"] == "doctor@example.com"
        assert entry.metadata_json["email"] == "lina@clinic.example.com"


def test_google_only_account_sets_first_password_without_current(client, app):
    auth = login_and_get_auth(client, "patient@example.com", "patient123")
    with app.app_context():
        user = User.query.filter_by(email="patient@example.com").first()
        user.password_hash = None
        db.session.commit()

    me = client.get("/api/auth/me", headers=_headers(auth)).get_json()["data"]
    assert me["has_password"] is False

    response = _change_password(client, auth, "", "First-Password-1")

    assert response.status_code == 200, response.get_json()
    assert response.get_json()["data"]["user"]["has_password"] is True
    assert client.post("/api/auth/login", json={"email": "patient@example.com", "password": "First-Password-1"}).status_code == 200


def test_credential_endpoints_require_sign_in(client):
    assert client.post("/api/auth/password", json={"current_password": "x", "new_password": "y" * 10}).status_code == 401
    assert client.post("/api/auth/email", json={"current_password": "x", "new_email": "a@b.co"}).status_code == 401
