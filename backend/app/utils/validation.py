"""Shared rules for account fields: email, password, and display name.

Used by self-registration, account changes, and admin user management so the
same input is accepted (or rejected with the same message) everywhere.
"""

import re

from app.errors import ValidationError

EMAIL_MAX_LENGTH = 254
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
NAME_MAX_LENGTH = 120

# Pragmatic address check: an unquoted local part, a dotted domain made of
# letters/digits/hyphens, and a top-level domain of at least two letters.
_EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+"
    r"@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*"
    r"\.[A-Za-z]{2,63}$"
)


def normalize_email(value, *, field: str = "email") -> str:
    """Return the trimmed, lower-cased email or raise ValidationError."""
    email = value.strip().lower() if isinstance(value, str) else ""
    local = email.partition("@")[0]
    if (
        not email
        or len(email) > EMAIL_MAX_LENGTH
        or len(local) > 64
        or ".." in email
        or local.startswith(".")
        or local.endswith(".")
        or not _EMAIL_PATTERN.match(email)
    ):
        raise ValidationError("A valid email is required.", details={"field": field})
    return email


def validate_password(value, *, field: str = "password") -> str:
    """Return the password unchanged (never trimmed) or raise ValidationError."""
    password = value if isinstance(value, str) else ""
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValidationError(
            f"Password must be at least {PASSWORD_MIN_LENGTH} characters.",
            details={"field": field, "rule": "min_length", "min": PASSWORD_MIN_LENGTH},
        )
    if len(password) > PASSWORD_MAX_LENGTH:
        raise ValidationError(
            f"Password must be at most {PASSWORD_MAX_LENGTH} characters.",
            details={"field": field, "rule": "max_length", "max": PASSWORD_MAX_LENGTH},
        )
    if not password.strip():
        raise ValidationError("Password cannot be only spaces.", details={"field": field, "rule": "blank"})
    return password


def normalize_name(value, *, field: str = "name") -> str:
    """Return the trimmed display name or raise ValidationError."""
    name = " ".join(value.split()) if isinstance(value, str) else ""
    if not name:
        raise ValidationError("Name is required.", details={"field": field})
    if len(name) > NAME_MAX_LENGTH:
        raise ValidationError(
            f"Name must be at most {NAME_MAX_LENGTH} characters.",
            details={"field": field, "rule": "max_length", "max": NAME_MAX_LENGTH},
        )
    return name
