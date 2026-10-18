"""Clinical notifications: who receives them and how they are stored.

Each notification keeps an English title and message (shown as-is by older
clients) plus a `kind` and `params` in its metadata, which the frontend uses
to show the notification in the reader's language.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import selectinload

from app.extensions import db
from app.models import Notification, Role, User
from app.models.entities import utc_now

logger = logging.getLogger(__name__)

REVIEW_PERMISSION = "diagnosis.review_any"


def clinical_reviewer_ids(*, exclude_user_id: int | None = None) -> list[int]:
    """Active users who may review any assessment, by role or direct grant.

    Using the permission (not the built-in "doctor" role name) means custom
    clinical roles such as a nurse reviewer are alerted too, and disabled
    accounts are not. The built-in admin role holds every permission for
    system management, so it alone does not make someone a clinical reviewer.
    """
    users = (
        User.query.filter(User.is_active.is_(True))
        .options(selectinload(User.roles).selectinload(Role.permissions), selectinload(User.direct_permissions))
        .all()
    )
    reviewer_ids = []
    for user in users:
        if exclude_user_id is not None and user.id == exclude_user_id:
            continue
        codes = {p.code for role in user.roles if role.name != "admin" for p in role.permissions}
        codes.update(p.code for p in user.direct_permissions)
        if REVIEW_PERMISSION in codes:
            reviewer_ids.append(user.id)
    return reviewer_ids


def notify(
    recipient_ids,
    *,
    kind: str,
    title: str,
    message: str,
    type: str = "info",
    link: str | None = None,
    params: dict | None = None,
    metadata: dict | None = None,
) -> int:
    """Create one notification per recipient in a single commit.

    A failure here must never break the clinical action that triggered it, so
    it is logged and rolled back instead of raised.
    """
    recipients = list(dict.fromkeys(int(r) for r in recipient_ids if r))
    if not recipients:
        return 0
    now = utc_now()
    payload = {**(metadata or {}), "kind": kind, "params": params or {}}
    try:
        db.session.add_all(
            Notification(
                user_id=user_id,
                title=title.strip(),
                message=message.strip(),
                type=type,
                link=link,
                metadata_json=payload,
                is_read=False,
                created_at=now,
            )
            for user_id in recipients
        )
        db.session.commit()
        return len(recipients)
    except Exception:
        db.session.rollback()
        logger.warning("Could not create %s notifications for %d recipient(s).", kind, len(recipients), exc_info=True)
        return 0
