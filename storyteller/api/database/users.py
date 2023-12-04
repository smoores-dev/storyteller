from ..models import DBUser, User
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


def get_users():
    cursor = connection.execute(
        """
        SELECT username, full_name, email
        FROM user
        """,
    )

    return [
        User(username=username, full_name=full_name, email=email)
        for username, full_name, email in cursor.fetchall()
    ]


def create_user(
    username: str, full_name: str, email: str, hashed_password: str, invite_key: str
):
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO user (
            username,
            full_name,
            email,
            hashed_password,
            user_permission_id
        ) VALUES (
            :username,
            :full_name,
            :email,
            :hashed_password,
            (
                SELECT user_permission_id
                FROM invite
                WHERE invite.key = :invite_key
            )
        )
        """,
        {
            "username": username,
            "full_name": full_name,
            "email": email,
            "hashed_password": hashed_password,
            "invite_key": invite_key,
        },
    )

    cursor.close()

    connection.commit()


def user_has_permission(username: str, permission: str):
    cursor = connection.execute(
        f"""
        SELECT {permission}
        FROM user_permission
        JOIN user
        ON user.user_permission_id = user_permission.id
        WHERE user.username = :username
        """,
        {"username": username, "permission": permission},
    )

    (has_permission,) = cursor.fetchone()

    return has_permission
