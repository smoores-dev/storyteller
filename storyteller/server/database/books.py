from typing import List, cast

from storyteller.synchronize.epub import EpubAuthor

from .connection import connection


def create_book(title: str, authors: List[EpubAuthor], epub_filename: str) -> int:
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO book (title, epub_filename) VALUES (:title, :epub_filename)
        """,
        {"title": title, "epub_filename": epub_filename},
    )

    book_id = cursor.lastrowid

    for author in authors:
        cursor.execute(
            """
            INSERT INTO author (name, file_as) VALUES (:name, :file_as)
            """,
            {"name": author.name, "file_as": author.file_as},
        )

        author_id = cursor.lastrowid

        cursor.execute(
            """
            INSERT INTO author_to_book (book_id, author_id, role) VALUES (:book_id, :author_id, :role)
            """,
            {"book_id": book_id, "author_id": author_id, "role": author.role},
        )

    cursor.close()
    connection.commit()

    return cast(int, book_id)


def add_audiofile(book_id: int, audio_filename: str):
    connection.execute(
        """
        UPDATE book SET audio_filename = :audio_filename where id = :book_id
        """,
        {"book_id": book_id, "audio_filename": audio_filename},
    )

    connection.commit()
