"""Who receives clinical notifications, what they say, and where they link."""

from unittest.mock import patch

import pytest
from werkzeug.security import generate_password_hash

from app.extensions import db, limiter
from app.models import Notification, Permission, Role, User
from tests.conftest import login_and_get_auth

BASE = {
    "excessive_thirst": True, "frequent_urination": True, "fasting_glucose": 131, "hba1c": 6.8,
    "age": 38, "bmi": 27.4, "save": True, "symptoms": {"excessive_thirst": True}, "risk_factors": {},
}
URGENT = {
    **BASE, "fasting_glucose": 420, "random_plasma_glucose": 520,
    "vomiting": True, "abdominal_pain": True, "crisis": True,
}


@pytest.fixture()
def staff(app):
    """A disabled doctor and an active nurse with a custom reviewing role."""
    limiter.enabled = False
    with app.app_context():
        Notification.query.delete()
        doctor_role = Role.query.filter_by(name="doctor").first()
        db.session.add(User(name="Dr. Retired", email="retired@example.com",
                            password_hash=generate_password_hash("retired-pass"), is_active=False, roles=[doctor_role]))
        reviewer = Role(name="nurse_reviewer", description="Clinical reviewer")
        reviewer.permissions = Permission.query.filter(
            Permission.code.in_(["diagnosis.review_any", "patient.view", "notification.view"])
        ).all()
        db.session.add(User(name="Nurse Reviewer", email="nurse@example.com",
                            password_hash=generate_password_hash("nurse-pass-1"), is_active=True, roles=[reviewer]))
        db.session.commit()
    yield
    limiter.enabled = True


def _headers(client, email, password):
    return {"Authorization": f"Bearer {login_and_get_auth(client, email, password)['access_token']}"}


def _received(app, kind):
    with app.app_context():
        rows = Notification.query.filter(Notification.metadata_json["kind"].as_string() == kind).all()
        return {db.session.get(User, n.user_id).email: n for n in rows}


def test_urgent_alerts_reach_active_reviewers_only(client, app, staff):
    doctor = _headers(client, "doctor@example.com", "doctor123")
    result = client.post("/api/diagnosis/", headers=doctor, json={**URGENT, "mode": "clinical", "patient_id": 1}).get_json()["data"]
    assert result["is_urgent"] is True

    alerts = _received(app, "urgent_case")
    # Custom reviewing roles are included; disabled accounts, admins, and the
    # clinician who entered the case are not.
    assert set(alerts) == {"nurse@example.com"}
    alert = alerts["nurse@example.com"]
    assert alert.type == "urgent"
    assert alert.link == f"/review?diagnosis_result_id={result['diagnosis_result_id']}"
    assert alert.metadata_json["params"]["patient"] == "John Patient"


def test_patient_review_request_reaches_every_active_reviewer(client, app, staff):
    patient = _headers(client, "patient@example.com", "patient123")
    response = client.post("/api/diagnosis/submit-to-care-team", headers=patient,
                           json={"payload": {**BASE, "mode": "self"}, "patient_note": "please check"})
    assert response.status_code == 200

    requests = _received(app, "review_requested")
    assert set(requests) == {"doctor@example.com", "nurse@example.com"}
    result_id = response.get_json()["data"]["diagnosis_result_id"]
    assert all(n.link == f"/review?diagnosis_result_id={result_id}" for n in requests.values())


def test_patient_hears_about_clinician_assessment_and_review(client, app, staff):
    doctor = _headers(client, "doctor@example.com", "doctor123")
    result_id = client.post("/api/diagnosis/", headers=doctor,
                            json={**BASE, "mode": "clinical", "patient_id": 1}).get_json()["data"]["diagnosis_result_id"]
    client.patch(f"/api/diagnosis/{result_id}/review", headers=doctor, json={"review_note": "Looks fine", "is_urgent": False})

    assessed = _received(app, "assessment_by_clinician")["patient@example.com"]
    # The demo doctor is called "Dr. Lina": no doubled title.
    assert assessed.title == "New assessment by Dr. Lina"
    assert assessed.link == f"/diagnosis/result?diagnosis_result_id={result_id}"
    reviewed = _received(app, "review_completed")["patient@example.com"]
    assert reviewed.link == f"/diagnosis/result?diagnosis_result_id={result_id}"
    assert reviewed.metadata_json["params"]["clinician"] == "Dr. Lina"


def test_a_notification_failure_does_not_break_the_assessment(client, app, staff):
    doctor = _headers(client, "doctor@example.com", "doctor123")
    with patch("app.services.notification_service.db.session.add_all", side_effect=RuntimeError("db hiccup")):
        response = client.post("/api/diagnosis/", headers=doctor, json={**URGENT, "mode": "clinical", "patient_id": 1})
    assert response.status_code == 200
    result_id = response.get_json()["data"]["diagnosis_result_id"]
    # The assessment itself was saved and can be read back.
    assert client.get(f"/api/diagnosis/{result_id}", headers=doctor).status_code == 200
