from .connection import connection


def revoke_token(token: str):
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO token_revokation (token)
        VALUES (:token)
        """,
        {"token": token},
    )

    connection.commit()


def is_token_revoked(token: str):
    cursor = connection.execute(
        """
        SELECT token
        FROM token_revokation
        WHERE token = :token
        """,
        {"token": token},
    )

    return cursor.fetchone() is not None
