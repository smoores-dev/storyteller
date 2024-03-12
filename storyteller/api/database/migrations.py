from dataclasses import dataclass
from hashlib import sha256
import os
from pathlib import Path

from .connection import connection


@dataclass
class Migration:
    id: float
    hash: str
    name: str


def get_migration(hash: str):
    cursor = connection.execute(
        """
        SELECT id, hash, name
        FROM migration
        WHERE hash = :hash
        """,
        {"hash": hash},
    )

    migration_row = cursor.fetchone()

    if migration_row is None:
        return None

    return Migration(id=migration_row[0], hash=migration_row[1], name=migration_row[2])


def create_migration(hash: str, name: str):
    connection.execute(
        """
        INSERT INTO migration
        (hash, name)
        VALUES (:hash, :name)
        """,
        {"hash": hash, "name": name},
    )

    connection.commit()


def migrate():
    migrations_dir = Path(".", "migrations")
    migration_files = sorted(os.listdir(migrations_dir))
    for migration_file in migration_files:
        with open(Path(migrations_dir, migration_file)) as migration_handle:
            migration_contents = migration_handle.read()
            hash = sha256(migration_contents.encode("utf-8")).hexdigest()
            if get_migration(hash) is None:
                migration_statements = [
                    statement
                    for statement in migration_contents.split(";")
                    if len(statement.strip())
                ]

                for statement in migration_statements:
                    print(statement)
                    connection.execute(statement)

                create_migration(hash, migration_file)
                connection.commit()
