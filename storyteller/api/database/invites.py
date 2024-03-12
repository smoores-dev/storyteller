from typing import cast

from storyteller.api.models import Invite
from .connection import connection


def create_invite(
    email: str,
    key: str,
    book_create: bool,
    book_delete: bool,
    book_read: bool,
    book_process: bool,
    book_download: bool,
    book_update: bool,
    book_list: bool,
    invite_list: bool,
    invite_delete: bool,
    user_create: bool,
    user_list: bool,
    user_read: bool,
    user_delete: bool,
    settings_update: bool,
):
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO user_permission (
            book_create,
            book_delete,
            book_read,
            book_process,
            book_download,
            book_update,
            book_list,
            invite_list,
            invite_delete,
            user_create,
            user_list,
            user_read,
            user_delete,
            settings_update
        ) VALUES (
            :book_create,
            :book_delete,
            :book_read,
            :book_process,
            :book_download,
            :book_update,
            :book_list,
            :invite_list,
            :invite_delete,
            :user_create,
            :user_list,
            :user_read,
            :user_delete,
            :settings_update
        )
        RETURNING uuid
        """,
        {
            "book_create": book_create,
            "book_delete": book_delete,
            "book_read": book_read,
            "book_process": book_process,
            "book_download": book_download,
            "book_update": book_update,
            "book_list": book_list,
            "invite_list": invite_list,
            "invite_delete": invite_delete,
            "user_create": user_create,
            "user_list": user_list,
            "user_read": user_read,
            "user_delete": user_delete,
            "settings_update": settings_update,
        },
    )

    (user_permission_uuid,) = cursor.fetchone()

    cursor.execute(
        """
        INSERT INTO invite (email, key, user_permission_uuid) VALUES (:email, :key, :user_permission_uuid)
        """,
        {"email": email, "key": key, "user_permission_uuid": user_permission_uuid},
    )

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


def get_invites():
    cursor = connection.execute(
        """
        SELECT invite.email, key
        FROM invite
        JOIN user_permission
            ON user_permission.uuid = invite.user_permission_uuid
        LEFT JOIN user
            ON user.user_permission_uuid = user_permission.uuid
        WHERE user.uuid IS NULL
        """
    )

    invites: list[Invite] = []

    for email, key in cursor:
        invites.append(Invite(email=email, key=key))

    return invites


def verify_invite(email: str, key: str):
    cursor = connection.execute(
        """
        SELECT uuid
        FROM invite
        WHERE email=:email
            AND key=:key
        """,
        {"email": email, "key": key},
    )

    return cursor.fetchone() is None


def delete_invite(invite_key: str):
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT user.uuid
        FROM user
        JOIN user_permission
            ON user.user_permission_uuid = user_permission.uuid
        JOIN invite
            ON invite.user_permission_uuid = user_permission.uuid
        WHERE invite.key = :invite_key
        """,
        {"invite_key": invite_key},
    )

    accepted_user = cursor.fetchone()

    if accepted_user is not None:
        raise KeyError("User has already accepted this invite")

    cursor.execute(
        """
        SELECT user_permission_uuid
        FROM invite
        WHERE invite.key = :invite_key
        """,
        {"invite_key": invite_key},
    )

    (user_permission_uuid,) = cursor.fetchone()

    cursor.execute(
        """
        DELETE FROM invite
        WHERE key = :key
        """,
        {"key": invite_key},
    )

    cursor.execute(
        """
        DELETE FROM user_permission
        WHERE uuid = :uuid
        """,
        {"uuid": user_permission_uuid},
    )

    connection.commit()
