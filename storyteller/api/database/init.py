from .connection import connection


def init_db():
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS book(
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            epub_filename TEXT,
            audio_filename TEXT
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS author(
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            file_as TEXT NOT NULL
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS author_to_book(
            id INTEGER PRIMARY KEY,
            book_id INTEGER,
            author_id INTEGER,
            role TEXT,
            FOREIGN KEY(book_id) REFERENCES book(id)
            FOREIGN KEY(author_id) REFERENCES author(id)
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS processing_task(
            id INTEGER PRIMARY KEY,
            type TEXT NOT NULL,
            book_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            progress REAL NOT NULL DEFAULT 0,
            FOREIGN KEY(book_id) REFERENCES book(id)
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS user(
            username TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            full_name TEXT,
            hashed_password TEXT NOT NULL
        )
        """
    )

    connection.commit()
