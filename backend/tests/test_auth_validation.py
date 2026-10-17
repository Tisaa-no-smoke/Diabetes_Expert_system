"""Validation of email, password, and name across sign-up, profile, and admin forms."""

import pytest

from app.extensions import limiter
from tests.conftest import login_and_get_auth


@pytest.fixture()
def no_rate_limit(app):
    limiter.enabled = False
    yield
    limiter.enabled = True


def _register(client, **fields):
    body = {"name": "Form Tester", "email": "form.tester@example.com", "password": "valid-pass-1", **fields}
    return client.post("/api/auth/register", json=body)


def _field(response):
    return response.get_json()["error"]["details"]["field"]


@pytest.mark.parametrize(
    "email",
    ["a@b", "x@", "@x.com", "a b@x.com", "<script>@x.com", "a..b@x.com", ".a@x.com",
     "a@x..com", "a@-x.com", "a@x.c", "a" * 250 + "@x.com", "", "   ", 12345, None],
)
def test_register_rejects_invalid_emails(client, no_rate_limit, email):
    response = _register(client, email=email)
    assert response.status_code == 400
    assert _field(response) == "email"


@pytest.mark.parametrize(
    ("email", "stored"),
    [("  Mixed.Case+tag@Example.COM ", "mixed.case+tag@example.com"),
     ("name@sub.clinic.example.org", "name@sub.clinic.example.org"),
     ("o'neil@example.kh", "o'neil@example.kh")],
)
def test_register_accepts_and_normalises_valid_emails(client, no_rate_limit, email, stored):
    response = _register(client, email=email)
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["data"]["user"]["email"] == stored


@pytest.mark.parametrize(
    ("password", "accepted"),
    [("1234567", False), ("        ", False), ("p" * 129, False), ("12345678", True), ("p" * 128, True),
     ("  spaced middle  ", True)],
)
def test_register_password_rules(client, no_rate_limit, password, accepted):
    response = _register(client, password=password)
    if accepted:
        assert response.status_code == 201, response.get_json()
        # Passwords are never trimmed: the exact value signs in.
        assert client.post("/api/auth/login", json={"email": "form.tester@example.com", "password": password}).status_code == 200
    else:
        assert response.status_code == 400
        assert _field(response) == "password"


@pytest.mark.parametrize(("name", "accepted"), [("N" * 120, True), ("N" * 121, False), ("   ", False), (None, False)])
def test_register_name_rules(client, no_rate_limit, name, accepted):
    response = _register(client, name=name)
    assert response.status_code == (201 if accepted else 400)
    if not accepted:
        assert _field(response) == "name"


def test_register_collapses_name_whitespace(client, no_rate_limit):
    response = _register(client, name="  Sok    Dara  ")
    assert response.get_json()["data"]["user"]["name"] == "Sok Dara"


def test_duplicate_email_points_at_the_email_field(client, no_rate_limit):
    response = _register(client, email="DOCTOR@example.com")
    assert response.status_code == 400
    assert response.get_json()["error"]["message"] == "Email is already in use."
    assert _field(response) == "email"


def test_existing_short_password_still_signs_in(client):
    # Seeded accounts predate the 8-character rule; signing in never re-validates.
    assert client.post("/api/auth/login", json={"email": "admin@example.com", "password": "admin123"}).status_code == 200


def test_admin_created_users_follow_the_same_rules(client, admin_auth):
    headers = {"Authorization": f"Bearer {admin_auth['access_token']}"}
    base = {"name": "New Doctor", "email": "new.doctor@example.com", "password": "valid-pass-1", "roles": ["doctor"]}
    for override, field in [({"email": "x@"}, "email"), ({"password": "short"}, "password"), ({"name": "N" * 121}, "name")]:
        response = client.post("/api/admin/users", headers=headers, json={**base, **override})
        assert response.status_code == 400, override
        assert _field(response) == field
    assert client.post("/api/admin/users", headers=headers, json=base).status_code == 201


def test_profile_fields_are_bounded(client):
    auth = login_and_get_auth(client, "doctor@example.com", "doctor123")
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    response = client.patch("/api/auth/me", headers=headers, json={"phone": "1" * 41})
    assert response.status_code == 400
    assert _field(response) == "phone"
    response = client.patch("/api/auth/me", headers=headers, json={"name": "N" * 121})
    assert response.status_code == 400
    assert client.patch("/api/auth/me", headers=headers, json={"phone": "+855 12 345 678"}).status_code == 200


def test_avatar_url_cannot_point_outside_the_app(client):
    auth = login_and_get_auth(client, "doctor@example.com", "doctor123")
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    for url in ["https://tracker.example.net/pixel.png", "javascript:alert(1)", "/api/auth/avatar/../../secret",
                "/api/auth/avatar/avatar_../../secret.png"]:
        response = client.patch("/api/auth/me", headers=headers, json={"avatar_url": url})
        assert response.status_code == 400, url
    assert client.patch("/api/auth/me", headers=headers, json={"avatar_url": None}).status_code == 200


def test_rate_limit_message_is_readable(client):
    for _ in range(5):
        _register(client, email="")
    response = _register(client, email="")
    assert response.status_code == 429
    error = response.get_json()["error"]
    assert error["code"] == "rate_limited"
    assert error["message"] == "Too many attempts. Please wait a minute and try again."
