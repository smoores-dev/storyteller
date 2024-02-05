import sqlite3
import sqlite_uuid

from storyteller.synchronize.files import DATA_DIR

DATABASE_URL = f"{DATA_DIR}/storyteller.db"

connection = sqlite3.connect(DATABASE_URL, check_same_thread=False)

connection.enable_load_extension(True)

connection.execute(
    "select load_extension(:path, 'sqlite3_uuid_init')",
    {"path": sqlite_uuid.extension_path()},
)

connection.enable_load_extension(False)
