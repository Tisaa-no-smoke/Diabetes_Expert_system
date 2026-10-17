"""Khmer PDF reports stay readable when WeasyPrint is unavailable (e.g. on Vercel)."""

from unittest.mock import patch

from app.services import diagnosis_report_service as reports
from tests.conftest import login_and_get_auth


def _report(client, lang):
    auth = login_and_get_auth(client, "patient@example.com", "patient123")
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    result = client.post("/api/diagnosis/", headers=headers, json={
        "mode": "self", "excessive_thirst": True, "frequent_urination": True,
        "fasting_glucose": 131, "hba1c": 6.8, "age": 38, "bmi": 27.4, "save": True,
        "symptoms": {"excessive_thirst": True}, "risk_factors": {},
    }).get_json()["data"]
    return client.get(f"/api/diagnosis/{result['diagnosis_result_id']}/report.pdf?lang={lang}", headers=headers)


def test_khmer_fallback_shapes_text(client):
    assert reports._ensure_khmer_font()
    # uharfbuzz must be installed, otherwise vowels and subscripts are misplaced.
    assert reports._khmer_font_is_shapable()

    shaped_styles = []
    original = reports._build_styles

    def spy(*args, **kwargs):
        styles = original(*args, **kwargs)
        shaped_styles.append(styles)
        return styles

    with patch.object(reports, "WEASYPRINT_AVAILABLE", False), patch.object(reports, "_build_styles", spy):
        response = _report(client, "km")

    assert response.status_code == 200
    assert response.data.startswith(b"%PDF")
    assert b"ReportLab" in response.data
    assert all(style.shaping for style in shaped_styles[0].byName.values())


def test_english_fallback_is_unchanged(client):
    with patch.object(reports, "WEASYPRINT_AVAILABLE", False):
        response = _report(client, "en")
    assert response.status_code == 200
    assert response.data.startswith(b"%PDF")


def test_symbols_missing_from_report_fonts_are_redrawn():
    assert reports._with_symbol_font("23.6 kg/m²") == "23.6 kg/m<super>2</super>"
    wrapped = reports._with_symbol_font("70 - 99 | ≥126 ទឹកនោមផ្អែម")
    # Drawn in the fallback font and kept apart from the number after it.
    assert f'<font name="{reports.SYMBOL_FONT_NAME}">≥</font> 126' in wrapped
    assert reports._with_symbol_font("< 5.7 normal") == "< 5.7 normal"
    assert reports._ensure_symbol_font()


def test_unentered_measurements_and_whole_number_age():
    rows = reports._extract_metric_rows({"age": 24.0, "bmi": 23.6, "waist_circumference": 0, "weight_kg": ""}, is_km=True)
    labels = [label for label, _value, _unit in rows]
    assert "ទំហំចង្កេះ" not in labels  # waist 0 means "not entered"
    assert len(rows) == 2
    assert reports._format_age(None, {"age": 24.0}, is_km=True) == "24 ឆ្នាំ"
    assert reports._format_age(None, {"age": 24.5}) == "24.5 yrs"
