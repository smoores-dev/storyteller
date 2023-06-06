from .app import app
from .database import init_db

init_db()

__all__ = ["app"]
