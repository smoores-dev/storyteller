from ..models import DBUser, User, UserPermissions
from .connection import connection


def get_user(username: str):
    cursor = connection.execute(
        """
        SELECT
            username,
            full_name,
            email,
            hashed_password,
            book_create,
            book_read,
            book_process,
            book_download,
            book_list,
            user_create,
            user_list,
            user_read,
            user_delete,
            settings_update
        FROM user
        JOIN user_permission
            ON user.user_permission_id = user_permission.id
        WHERE username = :username
        """,
        {"username": username},
    )

    (
        username,
        full_name,
        email,
        hashed_password,
        book_create,
        book_read,
        book_process,
        book_download,
        book_list,
        user_create,
        user_list,
        user_read,
        user_delete,
        settings_update,
    ) = cursor.fetchone()

    return DBUser(
        username=username,
        full_name=full_name,
        email=email,
        permissions=UserPermissions(
            book_create=book_create,
            book_read=book_read,
            book_process=book_process,
            book_download=book_download,
            book_list=book_list,
            user_create=user_create,
            user_list=user_list,
            user_read=user_read,
            user_delete=user_delete,
            settings_update=settings_update,
        ),
        hashed_password=hashed_password,
    )


def get_user_count():
    cursor = connection.execute(
        """
        SELECT count(id) as count
        FROM user;
        """
    )

    (count,) = cursor.fetchone()

    return count


def get_users():
    cursor = connection.execute(
        """
        SELECT
            username,
            full_name,
            email,
            hashed_password,
            book_create,
            book_read,
            book_process,
            book_download,
            book_list,
            user_create,
            user_list,
            user_read,
            user_delete,
            settings_update
        FROM user
        JOIN user_permission
            ON user.user_permission_id = user_permission.id
        """,
    )

    return [
        DBUser(
            username=username,
            full_name=full_name,
            email=email,
            permissions=UserPermissions(
                book_create=book_create,
                book_read=book_read,
                book_process=book_process,
                book_download=book_download,
                book_list=book_list,
                user_create=user_create,
                user_list=user_list,
                user_read=user_read,
                user_delete=user_delete,
                settings_update=settings_update,
            ),
            hashed_password=hashed_password,
        )
        for (
            username,
            full_name,
            email,
            hashed_password,
            book_create,
            book_read,
            book_process,
            book_download,
            book_list,
            user_create,
            user_list,
            user_read,
            user_delete,
            settings_update,
        ) in cursor.fetchall()
    ]


def create_admin_user(
    username: str,
    full_name: str,
    email: str,
    hashed_password: str,
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
            user_delete,
            settings_update
        ) SELECT 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
        WHERE NOT EXISTS (
            SELECT id
            FROM user_permission
        )
        """
    )

    cursor.execute(
        """
        INSERT INTO user (
            username,
            full_name,
            email,
            hashed_password,
            user_permission_id
        ) SELECT
            :username,
            :full_name,
            :email,
            :hashed_password,
            :user_permission_id
        WHERE NOT EXISTS (
            SELECT id
            FROM user
        )
        """,
        {
            "username": username,
            "full_name": full_name,
            "email": email,
            "hashed_password": hashed_password,
            "user_permission_id": cursor.lastrowid,
        },
    )

    connection.commit()


def create_user(
    username: str,
    full_name: str,
    email: str,
    hashed_password: str,
    invite_key: str | None = None,
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
