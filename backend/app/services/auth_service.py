from pathlib import Path
import re
import time
from datetime import UTC, datetime
from uuid import uuid4

from flask import current_app
import jwt
from jwt import ExpiredSignatureError, InvalidTokenError
from werkzeug.security import check_password_hash, generate_password_hash

from app.errors import ForbiddenError, GoogleAuthNotConfiguredError, NotFoundError, UnauthorizedError, ValidationError
from app.extensions import db
from app.utils.validation import NAME_MAX_LENGTH, normalize_email, normalize_name, validate_password


def _get_google_auth_request():
    try:
        from google.auth.transport.requests import Request
        return Request()
    except Exception:
        import urllib.request
        from google.auth.transport import Response

        class _StdLibResponse(Response):
            def __init__(self, status: int, headers: dict, data: bytes):
                self._status = status
                self._headers = headers
                self._data = data

            @property
            def status(self):
                return self._status

            @property
            def headers(self):
                return self._headers

            @property
            def data(self):
                return self._data

        class _StdLibRequest:
            def __call__(self, url, method="GET", body=None, headers=None, timeout=None, **kwargs):
                req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
                with urllib.request.urlopen(req, timeout=timeout or 10) as resp:
                    return _StdLibResponse(status=resp.status, headers=dict(resp.headers), data=resp.read())

        return _StdLibRequest()


class AuthService:
    ACCESS_TOKEN_TYPE = "access"
    REFRESH_TOKEN_TYPE = "refresh"
    UPLOADED_AVATAR_URL = re.compile(r"/api/auth/avatar/avatar_\d+_\d+_[0-9a-f]{8}\.(?:png|jpe?g|webp|gif)")
    # Mirrors the users table column sizes so oversized input is a form error.
    PROFILE_FIELD_MAX_LENGTHS = {
        "phone": 40,
        "department": 120,
        "title": 120,
        "hospital_affiliation": 255,
        "license_number": 80,
        "bio": 2000,
    }

    def __init__(
        self,
        user_repository,
        token_repository,
        secret_key: str,
        algorithm: str,
        access_token_expires_seconds: int,
        refresh_token_expires_seconds: int,
        audit_log_repository=None,
        patient_repository=None,
        google_client_id: str | None = None,
    ):
        self.user_repository = user_repository
        self.token_repository = token_repository
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.access_token_expires_seconds = access_token_expires_seconds
        self.refresh_token_expires_seconds = refresh_token_expires_seconds
        self.audit_log_repository = audit_log_repository
        self.patient_repository = patient_repository
        self.google_client_id = google_client_id

    def register(self, payload: dict) -> dict:
        if not isinstance(payload, dict):
            raise ValidationError("A JSON object is required.")

        name = normalize_name(payload.get("name"))
        email = normalize_email(payload.get("email"))
        password = validate_password(payload.get("password"))
        if self.user_repository.get_by_email_case_insensitive(email):
            raise ValidationError("Email is already in use.", details={"field": "email"})

        patient_role = self.user_repository.get_role_by_name("patient")
        if not patient_role:
            raise ValidationError("Patient self-registration is not available because the patient role is not configured.")

        try:
            user = self.user_repository.create_user(
                email=email,
                password_hash=generate_password_hash(password),
                name=name,
                is_active=True,
                role_names=["patient"],
                commit=False,
            )
            self.patient_repository.create_patient(
                {
                    "user_id": user.id,
                    "full_name": name,
                    "gender": "unknown",
                    "date_of_birth": None,
                    "phone": None,
                    "notes": "Created through self-registration.",
                },
                commit=False,
            )
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

        public_user = self.user_repository.to_public_dict(user)
        tokens = self.issue_tokens(public_user)

        if self.audit_log_repository:
            self.audit_log_repository.create(
                action="auth.register",
                entity_type="user",
                entity_id=str(user.id),
                actor_user_id=user.id,
                metadata={"email": user.email, "roles": ["patient"]},
            )

        return {
            **tokens,
            "user": public_user,
        }

    def login(self, email: str, password: str) -> dict:
        if not email or not password:
            raise ValidationError("Email and password are required.")

        user = self.user_repository.get_by_email_case_insensitive(email.strip())
        if not user or not user.password_hash or not check_password_hash(user.password_hash, password):
            raise UnauthorizedError("Invalid credentials.")

        if not user.is_active:
            raise UnauthorizedError("User account is inactive.")

        public_user = self.user_repository.to_public_dict(user)
        tokens = self.issue_tokens(public_user)

        if self.audit_log_repository:
            self.audit_log_repository.create(
                action="auth.login",
                entity_type="user",
                entity_id=str(user.id),
                actor_user_id=user.id,
                metadata={"email": user.email},
            )

        return {
            **tokens,
            "user": public_user,
        }

    def login_with_google(self, credential: str) -> dict:
        client_id = self.google_client_id
        if not client_id and current_app:
            client_id = current_app.config.get("GOOGLE_CLIENT_ID")

        if not client_id:
            raise GoogleAuthNotConfiguredError("Google login is not configured on the server.")


        if not credential or not isinstance(credential, str) or not credential.strip():
            raise ValidationError("credential is required.")

        credential = credential.strip()

        id_info = None
        is_access_token = credential.startswith("ya29.")

        if not is_access_token:
            try:
                from google.oauth2 import id_token

                id_info = id_token.verify_oauth2_token(
                    credential,
                    _get_google_auth_request(),
                    client_id,
                )
            except ValueError as e:
                if "Wrong number of segments in token" in str(e):
                    is_access_token = True
                else:
                    raise UnauthorizedError("Invalid Google credential.")
            except Exception as e:
                raise UnauthorizedError("Failed to verify Google credential.")

        if is_access_token:
            try:
                import requests

                userinfo_resp = requests.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {credential}"},
                    timeout=10,
                )
                if userinfo_resp.status_code != 200:
                    raise UnauthorizedError("Failed to verify Google access token with Google API.")
                id_info = userinfo_resp.json()
            except UnauthorizedError:
                raise
            except Exception as e:
                raise UnauthorizedError("Failed to verify Google credential.")

        if not id_info.get("email_verified"):
            raise UnauthorizedError("Google account email is not verified.")

        google_sub = str(id_info.get("sub") or "").strip()
        email = str(id_info.get("email") or "").strip().lower()
        # Fit the column; a Google display name is trusted but may be long.
        name = " ".join(str(id_info.get("name") or id_info.get("given_name") or email.split("@")[0]).split())[:NAME_MAX_LENGTH]
        picture = id_info.get("picture")

        if not google_sub or not email:
            raise UnauthorizedError("Invalid Google credential claims.")

        # 1. Lookup by google_sub
        user = self.user_repository.get_by_google_sub(google_sub)
        if user:
            if not user.is_active:
                raise UnauthorizedError("User account is inactive.")
            roles = {role.name.lower() for role in user.roles}
            if roles != {"patient"}:
                raise ForbiddenError("Google login is restricted to patient accounts.")

        # 2. Lookup by email if not found by google_sub
        if not user:
            user = self.user_repository.get_by_email_case_insensitive(email)
            if user:
                # Reject if existing account is not a patient
                user_roles = [r.name.lower() for r in user.roles]
                staff_roles = {"admin", "doctor"}
                if any(role in staff_roles for role in user_roles) or (user_roles and "patient" not in user_roles):
                    raise ForbiddenError("Google login is restricted to patient accounts and cannot be linked to staff accounts.")

                self.user_repository.link_google_sub(user, google_sub)
                if self.audit_log_repository:
                    self.audit_log_repository.create(
                        action="auth.google_link",
                        entity_type="user",
                        entity_id=str(user.id),
                        actor_user_id=user.id,
                        metadata={"email": user.email, "google_sub": google_sub},
                    )

        # 3. Create new user if account does not exist
        if not user:
            patient_role = self.user_repository.get_role_by_name("patient")
            if not patient_role:
                raise ValidationError("Patient self-registration is not available because the patient role is not configured.")

            try:
                user = self.user_repository.create_user(
                    email=email,
                    password_hash=None,
                    name=name,
                    is_active=True,
                    role_names=["patient"],
                    google_sub=google_sub,
                    commit=False,
                )
                if picture and not getattr(user, "avatar_url", None):
                    user.avatar_url = picture

                self.patient_repository.create_patient(
                    {
                        "user_id": user.id,
                        "full_name": name,
                        "gender": "unknown",
                        "date_of_birth": None,
                        "phone": None,
                        "notes": "Created through Google authentication.",
                    },
                    commit=False,
                )
                db.session.commit()
            except Exception:
                db.session.rollback()
                raise

            if self.audit_log_repository:
                self.audit_log_repository.create(
                    action="auth.google_register",
                    entity_type="user",
                    entity_id=str(user.id),
                    actor_user_id=user.id,
                    metadata={"email": user.email, "roles": ["patient"], "google_sub": google_sub},
                )

        if not user.is_active:
            raise UnauthorizedError("User account is inactive.")

        if picture and not getattr(user, "avatar_url", None):
            user.avatar_url = picture
            db.session.commit()

        public_user = self.user_repository.to_public_dict(user)
        tokens = self.issue_tokens(public_user)

        if self.audit_log_repository:
            self.audit_log_repository.create(
                action="auth.google_login",
                entity_type="user",
                entity_id=str(user.id),
                actor_user_id=user.id,
                metadata={"email": user.email},
            )

        return {
            **tokens,
            "user": public_user,
        }

    def refresh(self, refresh_token: str) -> dict:
        if not refresh_token:
            raise ValidationError("refresh_token is required.")

        payload = self.decode_token(refresh_token, expected_type=self.REFRESH_TOKEN_TYPE)
        user_id = int(payload["sub"])
        user = self.user_repository.get_by_id(user_id)

        if not user or not user.is_active:
            raise UnauthorizedError("User account is inactive.")

        self._revoke_from_payload(payload)

        public_user = self.user_repository.to_public_dict(user)
        tokens = self.issue_tokens(public_user)

        if self.audit_log_repository:
            self.audit_log_repository.create(
                action="auth.refresh",
                entity_type="user",
                entity_id=str(user.id),
                actor_user_id=user.id,
                metadata={},
            )

        return {
            **tokens,
            "user": public_user,
        }

    def logout(self, access_token: str | None, refresh_token: str | None, actor_user_id: int | None = None):
        if not access_token and not refresh_token:
            raise ValidationError("At least one token is required for logout.")

        revoked_jtis = []

        for token, expected_type in (
            (access_token, self.ACCESS_TOKEN_TYPE),
            (refresh_token, self.REFRESH_TOKEN_TYPE),
        ):
            if not token:
                continue

            payload = self.decode_token(
                token,
                expected_type=expected_type,
                verify_exp=False,
                check_revoked=False,
                check_user_active=False,
            )
            self._revoke_from_payload(payload)
            if payload.get("jti"):
                revoked_jtis.append(payload["jti"])

        if self.audit_log_repository:
            self.audit_log_repository.create(
                action="auth.logout",
                entity_type="user",
                entity_id=str(actor_user_id) if actor_user_id else None,
                actor_user_id=actor_user_id,
                metadata={"revoked_token_count": len(revoked_jtis)},
            )

    def issue_tokens(self, user: dict) -> dict:
        access_token = self._create_token(
            user,
            token_type=self.ACCESS_TOKEN_TYPE,
            expires_seconds=self.access_token_expires_seconds,
        )
        refresh_token = self._create_token(
            user,
            token_type=self.REFRESH_TOKEN_TYPE,
            expires_seconds=self.refresh_token_expires_seconds,
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "Bearer",
            "expires_in": self.access_token_expires_seconds,
        }

    def change_password(self, user_id: int, *, current_password: str, new_password: str) -> dict:
        """Change (or, for Google-only accounts, set) the signed-in user's password."""
        user = self._get_active_user(user_id)
        self._verify_current_password(user, current_password)

        new_password = validate_password(new_password, field="new_password")
        if user.password_hash and check_password_hash(user.password_hash, new_password):
            raise ValidationError(
                "New password must be different from the current password.",
                details={"field": "new_password"},
            )

        had_password = bool(user.password_hash)
        user.password_hash = generate_password_hash(new_password)
        return self._finish_credential_change(
            user,
            action="auth.password_change" if had_password else "auth.password_set",
            metadata={},
        )

    def change_email(self, user_id: int, *, current_password: str, new_email: str) -> dict:
        """Change the signed-in user's sign-in email."""
        user = self._get_active_user(user_id)
        self._verify_current_password(user, current_password)

        email = normalize_email(new_email, field="new_email")
        if email == (user.email or "").lower():
            raise ValidationError("This is already your email.", details={"field": "new_email"})
        existing = self.user_repository.get_by_email_case_insensitive(email)
        if existing and existing.id != user.id:
            raise ValidationError("Email is already in use.", details={"field": "new_email"})

        previous_email = user.email
        user.email = email
        return self._finish_credential_change(
            user,
            action="auth.email_change",
            metadata={"previous_email": previous_email, "email": email},
        )

    def _get_active_user(self, user_id):
        user = self.user_repository.get_by_id(user_id)
        if not user or not user.is_active:
            raise UnauthorizedError("User account is inactive.")
        return user

    @staticmethod
    def _verify_current_password(user, current_password: str) -> None:
        # A wrong current password is a form error (400), not an expired
        # session (401): the client signs the user out on 401.
        if not user.password_hash:
            return
        if not current_password or not check_password_hash(user.password_hash, str(current_password)):
            raise ValidationError("Current password is incorrect.", details={"field": "current_password"})

    def _finish_credential_change(self, user, *, action: str, metadata: dict) -> dict:
        # Whole seconds: token "iat" claims are whole seconds, and tokens
        # issued right after this change must stay valid.
        user.credentials_changed_at = datetime.now(UTC).replace(tzinfo=None, microsecond=0)
        db.session.commit()

        if self.audit_log_repository:
            self.audit_log_repository.create(
                action=action,
                entity_type="user",
                entity_id=str(user.id),
                actor_user_id=user.id,
                metadata=metadata,
            )

        public_user = self.user_repository.to_public_dict(user)
        return {**self.issue_tokens(public_user), "user": public_user}

    def decode_access_token(self, token: str) -> dict:
        return self.decode_token(token, expected_type=self.ACCESS_TOKEN_TYPE)

    def get_fresh_user(self, user_id) -> dict | None:
        """Re-serialize the user from the DB so /auth/me never serves stale JWT claims."""
        user = self.user_repository.get_by_id(user_id)
        if not user:
            return None
        return self.user_repository.to_public_dict(user)

    def decode_token(
        self,
        token: str,
        *,
        expected_type: str | None = None,
        verify_exp: bool = True,
        check_revoked: bool = True,
        check_user_active: bool = True,
    ) -> dict:
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
                options={"verify_exp": verify_exp},
            )
        except ExpiredSignatureError as exc:
            raise UnauthorizedError("Token has expired.") from exc
        except InvalidTokenError as exc:
            raise UnauthorizedError("Invalid token.") from exc

        token_type = payload.get("type")
        if expected_type and token_type != expected_type:
            raise UnauthorizedError(f"Invalid token type. Expected {expected_type}.")

        jti = payload.get("jti")
        if check_revoked and jti and self.token_repository.is_revoked(jti):
            raise UnauthorizedError("Token has been revoked.")

        if check_user_active:
            user_id = payload.get("sub")
            user = self.user_repository.get_by_id(int(user_id)) if user_id else None
            if not user or not user.is_active:
                raise UnauthorizedError("User account is inactive.")
            changed_at = user.credentials_changed_at
            if changed_at is not None:
                changed_ts = int(changed_at.replace(tzinfo=UTC).timestamp())
                if int(payload.get("iat") or 0) < changed_ts:
                    raise UnauthorizedError("Your sign-in details changed. Please sign in again.")

        return payload

    def _create_token(self, user: dict, *, token_type: str, expires_seconds: int) -> str:
        issued_at = int(time.time())
        payload = {
            "jti": uuid4().hex,
            "type": token_type,
            "sub": str(user["id"]),
            "email": user["email"],
            "role": user["role"],
            "roles": user.get("roles", [user["role"]]),
            "permissions": user.get("permissions", []),
            "patient_id": user.get("patient_id"),
            "name": user["name"],
            "iat": issued_at,
            "exp": issued_at + expires_seconds,
        }
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def _revoke_from_payload(self, payload: dict):
        jti = payload.get("jti")
        if not jti:
            return

        self.token_repository.revoke_token(
            jti=jti,
            token_type=payload.get("type", "unknown"),
            user_id=int(payload["sub"]) if payload.get("sub") else None,
            expires_at=datetime.fromtimestamp(int(payload.get("exp", int(time.time()))), UTC),
        )

    @staticmethod
    def get_avatar_dir() -> Path:
        avatar_dir = Path(current_app.instance_path) / "uploads" / "avatars"
        avatar_dir.mkdir(parents=True, exist_ok=True)
        return avatar_dir

    def update_profile(self, user_id: int, payload: dict) -> dict:
        if not isinstance(payload, dict):
            raise ValidationError("Payload must be a JSON object.")

        user = self.user_repository.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")

        updates = {}
        if "name" in payload:
            updates["name"] = normalize_name(payload.get("name"))

        for field, max_length in self.PROFILE_FIELD_MAX_LENGTHS.items():
            if field in payload:
                val = payload.get(field)
                if val is not None:
                    val = str(val).strip()
                    if val == "":
                        val = None
                if val is not None and len(val) > max_length:
                    raise ValidationError(
                        f"{field} must be at most {max_length} characters.",
                        details={"field": field, "rule": "max_length", "max": max_length},
                    )
                updates[field] = val

        if "avatar_url" in payload:
            # Photos are set through the upload endpoint; here they can only be
            # cleared or pointed back at an uploaded file, never at an outside
            # address (which would expose every viewer's IP to that server).
            avatar_url = str(payload.get("avatar_url") or "").strip() or None
            if avatar_url is not None and not self.UPLOADED_AVATAR_URL.fullmatch(avatar_url):
                raise ValidationError("avatar_url must be an uploaded photo.", details={"field": "avatar_url"})
            updates["avatar_url"] = avatar_url

        if not updates:
            raise ValidationError("At least one profile field is required to update.")

        updated_user = self.user_repository.update_profile(user, updates)
        public_user = self.user_repository.to_public_dict(updated_user)

        if self.audit_log_repository:
            self.audit_log_repository.create(
                action="user.profile_update",
                entity_type="user",
                entity_id=str(user.id),
                actor_user_id=user.id,
                metadata={"updated_fields": sorted(updates.keys())},
            )

        return public_user

    def save_avatar(self, user_id: int, file) -> dict:
        if not file or not file.filename:
            raise ValidationError("No image file provided.")

        allowed_extensions = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
        original_ext = Path(file.filename).suffix.lower()
        if original_ext not in allowed_extensions:
            raise ValidationError(f"Invalid image format '{original_ext}'. Allowed formats: PNG, JPG, JPEG, WEBP, GIF.")

        user = self.user_repository.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")

        # Clean old local avatar file if exists
        self._remove_local_avatar_file(user.avatar_url, user_id)

        avatar_dir = self.get_avatar_dir()
        filename = f"avatar_{user_id}_{int(time.time())}_{uuid4().hex[:8]}{original_ext}"
        target_path = avatar_dir / filename
        file.save(str(target_path))

        avatar_url = f"/api/auth/avatar/{filename}"
        updated_user = self.user_repository.update_profile(user, {"avatar_url": avatar_url})
        return self.user_repository.to_public_dict(updated_user)

    def delete_avatar(self, user_id: int) -> dict:
        user = self.user_repository.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")

        self._remove_local_avatar_file(user.avatar_url, user_id)
        updated_user = self.user_repository.update_profile(user, {"avatar_url": None})
        return self.user_repository.to_public_dict(updated_user)

    def _remove_local_avatar_file(self, avatar_url: str | None, user_id: int):
        if not avatar_url or not avatar_url.startswith("/api/auth/avatar/"):
            return
        filename = avatar_url.removeprefix("/api/auth/avatar/")
        if not filename.startswith(f"avatar_{user_id}_") or "/" in filename or "\\" in filename:
            return
        avatar_dir = self.get_avatar_dir().resolve()
        file_path = (avatar_dir / filename).resolve()
        if file_path.parent != avatar_dir:
            return
        try:
            if file_path.is_file():
                file_path.unlink()
        except OSError:
            pass
