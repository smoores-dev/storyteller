import sqlite3

DATABASE_URL = "storyteller.db"

connection = sqlite3.connect(DATABASE_URL, check_same_thread=False)
