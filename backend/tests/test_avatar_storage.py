"""Profile photos are stored in the database so any server instance can serve them."""

from io import BytesIO

import pytest
from PIL import Image

from app.extensions import db
from app.models import User, UserAvatar
from tests.conftest import login_and_get_auth


def _image_bytes(fmt="PNG", size=(64, 64), color=(37, 99, 235)):
    buffer = BytesIO()
    Image.new("RGB", size, color).save(buffer, format=fmt)
    return buffer.getvalue()


@pytest.fixture()
def doctor(client):
    auth = login_and_get_auth(client, "doctor@example.com", "doctor123")
    return {"Authorization": f"Bearer {auth['access_token']}"}


def _upload(client, headers, data, filename="photo.png"):
    return client.post(
        "/api/auth/avatar",
        headers=headers,
        data={"file": (BytesIO(data), filename)},
        content_type="multipart/form-data",
    )


def test_uploaded_photo_is_stored_and_served_from_the_database(client, app, doctor):
    jpeg = _image_bytes("JPEG")
    response = _upload(client, doctor, jpeg, "avatar.jpg")
    assert response.status_code == 200, response.get_json()
    url = response.get_json()["data"]["avatar_url"]
    assert url.endswith(".jpg")

    with app.app_context():
        stored = UserAvatar.query.one()
        assert stored.data == jpeg and stored.content_type == "image/jpeg"

    served = client.get(url)
    assert served.status_code == 200
    assert served.data == jpeg
    assert served.mimetype == "image/jpeg"
    assert served.headers["Cache-Control"] == "public, max-age=31536000, immutable"


def test_extension_follows_the_real_image_format(client, doctor):
    # A PNG named .jpg is stored and served as PNG.
    url = _upload(client, doctor, _image_bytes("PNG"), "misnamed.jpg").get_json()["data"]["avatar_url"]
    assert url.endswith(".png")
    assert client.get(url).mimetype == "image/png"


def test_replacing_a_photo_removes_the_old_one(client, app, doctor):
    first = _upload(client, doctor, _image_bytes(color=(1, 2, 3))).get_json()["data"]["avatar_url"]
    second = _upload(client, doctor, _image_bytes(color=(4, 5, 6))).get_json()["data"]["avatar_url"]
    assert first != second
    assert client.get(first).status_code == 404
    assert client.get(second).status_code == 200
    with app.app_context():
        assert UserAvatar.query.count() == 1


def test_removing_a_photo(client, app, doctor):
    url = _upload(client, doctor, _image_bytes()).get_json()["data"]["avatar_url"]
    response = client.delete("/api/auth/avatar", headers=doctor)
    assert response.get_json()["data"]["avatar_url"] is None
    assert client.get(url).status_code == 404
    with app.app_context():
        assert UserAvatar.query.count() == 0


@pytest.mark.parametrize(
    ("data", "filename"),
    [(b"not an image at all", "fake.png"), (b"<svg onload=alert(1)></svg>", "x.svg"), (b"x" * (2 * 1024 * 1024 + 1), "big.png")],
)
def test_non_images_and_oversized_files_are_rejected(client, app, doctor, data, filename):
    response = _upload(client, doctor, data, filename)
    assert response.status_code == 400
    with app.app_context():
        assert UserAvatar.query.count() == 0


@pytest.mark.parametrize("name", ["../secret.txt", "avatar_1_x.png", "avatar_1_123_zzzzzzzz.png", "nope"])
def test_unknown_or_malformed_photo_names_are_404(client, name):
    assert client.get(f"/api/auth/avatar/{name}").status_code == 404


def test_legacy_disk_photos_are_imported_and_still_served(client, app, tmp_path, monkeypatch):
    png = _image_bytes("PNG")
    filename = "avatar_2_1790000000_abcdef12.png"
    with app.app_context():
        legacy_dir = tmp_path / "uploads" / "avatars"
        legacy_dir.mkdir(parents=True)
        (legacy_dir / filename).write_bytes(png)
        monkeypatch.setattr(app, "instance_path", str(tmp_path))
        user = User.query.filter_by(email="doctor@example.com").first()
        user.avatar_url = f"/api/auth/avatar/{filename}"
        db.session.commit()

    # Before import the file is still served from disk.
    assert client.get(f"/api/auth/avatar/{filename}").data == png

    result = app.test_cli_runner().invoke(args=["import-avatars"])
    assert "Imported 1 photo(s)" in result.output
    (tmp_path / "uploads" / "avatars" / filename).unlink()
    # After import it comes from the database, under the same URL.
    assert client.get(f"/api/auth/avatar/{filename}").data == png
