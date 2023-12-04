import json
from ..database.connection import connection


def get_setting(name: str):
    cursor = connection.execute(
        """
        SELECT value
        FROM settings
        WHERE name = :name
        """,
        {"name": name},
    )

    (value_json,) = cursor.fetchone()

    value = json.loads(value_json)

    return value
