from typing import cast

from storyteller.api.models import Invite
from .connection import connection


def create_invite(
    email: str,
    key: str,
    book_create: bool,
    book_read: bool,
    book_process: bool,
    book_download: bool,
    book_list: bool,
    user_create: bool,
    user_list: bool,
    user_read: bool,
    user_delete: bool,
):
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO user_permission (
            book_create,
            book_read,
            book_process,
            book_download,
            book_list,
            user_create,
            user_list,
            user_read,
            user_delete
        ) VALUES (
            :book_create,
            :book_read,
            :book_process,
            :book_download,
            :book_list,
            :user_create,
            :user_list,
            :user_read,
            :user_delete
        )
        """,
        {
            "book_create": book_create,
            "book_read": book_read,
            "book_process": book_process,
            "book_download": book_download,
            "book_list": book_list,
            "user_create": user_create,
            "user_list": user_list,
            "user_read": user_read,
            "user_delete": user_delete,
        },
    )

    user_permission_id = cast(int, cursor.lastrowid)

    cursor.execute(
        """
        INSERT INTO invite (email, key, user_permission_id) VALUES (:email, :key, :user_permission_id)
        """,
        {"email": email, "key": key, "user_permission_id": user_permission_id},
    )

    cursor.close()
    connection.commit()


def get_invite(key: str):
    cursor = connection.execute(
        """
        SELECT email
        FROM invite
        WHERE key = :key
        """,
        {"key": key},
    )

    (email,) = cursor.fetchone()
    return Invite(email=email, key=key)


def verify_invite(email: str, key: str):
    cursor = connection.execute(
        """
        SELECT id
        FROM invite
        WHERE email=:email
            AND key=:key
        """,
        {"email": email, "key": key},
    )

    return cursor.fetchone() is None
