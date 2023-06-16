import sqlite3

from storyteller.synchronize.files import DATA_DIR

DATABASE_URL = f"{DATA_DIR}/storyteller.db"

connection = sqlite3.connect(DATABASE_URL, check_same_thread=False)
