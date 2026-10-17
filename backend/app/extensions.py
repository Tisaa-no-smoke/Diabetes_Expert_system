from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

# Shared extension instances initialized in app factory.
# Objects are not expired on commit: every write path commits mid-request and
# then serialises what it just wrote, and with a remote database each implicit
# reload after a commit is another network round-trip. No column relies on a
# server-side default, so the in-memory state is already authoritative.
db = SQLAlchemy(session_options={"expire_on_commit": False})
migrate = Migrate()
limiter = Limiter(key_func=get_remote_address)
