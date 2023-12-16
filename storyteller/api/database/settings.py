import json
from typing import Any

from ..models import Settings
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


def get_settings():
    cursor = connection.execute(
        """
        SELECT name, value
        FROM settings
        """
    )

    settings: dict[str, Any] = {}

    for name, value_json in cursor:
        value = json.loads(value_json)
        settings[name] = value

    return Settings(
        smtp_from=settings["smtp_from"],
        smtp_host=settings["smtp_host"],
        smtp_port=settings["smtp_port"],
        smtp_password=settings["smtp_password"],
        smtp_username=settings["smtp_username"],
        web_url=settings["web_url"],
        library_name=settings["library_name"],
    )


def update_settings(settings: Settings):
    connection.execute(
        """
        UPDATE settings
        SET value = :value
        WHERE name = 'smtp_from'
        """,
        {"value": json.dumps(settings.smtp_from)},
    )
    connection.execute(
        """
        UPDATE settings
        SET value = :value
        WHERE name = 'smtp_host'
        """,
        {"value": json.dumps(settings.smtp_host)},
    )
    connection.execute(
        """
        UPDATE settings
        SET value = :value
        WHERE name = 'smtp_port'
        """,
        {"value": json.dumps(settings.smtp_port)},
    )
    connection.execute(
        """
        UPDATE settings
        SET value = :value
        WHERE name = 'smtp_username'
        """,
        {"value": json.dumps(settings.smtp_username)},
    )
    connection.execute(
        """
        UPDATE settings
        SET value = :value
        WHERE name = 'smtp_password'
        """,
        {"value": json.dumps(settings.smtp_password)},
    )
    connection.execute(
        """
        UPDATE settings
        SET value = :value
        WHERE name = 'web_url'
        """,
        {"value": json.dumps(settings.web_url)},
    )
    connection.execute(
        """
        UPDATE settings
        SET value = :value
        WHERE name = 'library_name'
        """,
        {"value": json.dumps(settings.library_name)},
    )

    connection.commit()
