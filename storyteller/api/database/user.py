from ..models import DBUser
from .connection import connection


def get_user(username: str):
    cursor = connection.execute(
        """
        SELECT username, full_name, email, hashed_password
        FROM user
        WHERE username = :username
        """,
        {"username": username},
    )

    username, full_name, email, hashed_password = cursor.fetchone()

    return DBUser(
        username=username,
        full_name=full_name,
        email=email,
        hashed_password=hashed_password,
    )
