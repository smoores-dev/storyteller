from typing import Dict, List, cast
from storyteller.api.database.processing_tasks import (
    ProcessingTaskStatus,
)
from ..models import Book, BookAuthor, BookDetail, ProcessingStatus

from storyteller.synchronize.epub import EpubAuthor

from .connection import connection


def create_book(
    title: str, authors: List[EpubAuthor], epub_filename: str
) -> BookDetail:
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO book (title, epub_filename) VALUES (:title, :epub_filename)
        """,
        {"title": title, "epub_filename": epub_filename},
    )

    book_id = cast(int, cursor.lastrowid)
    book = BookDetail(id=book_id, title=title, authors=[], processing_status=None)

    for author in authors:
        cursor.execute(
            """
            INSERT INTO author (name, file_as) VALUES (:name, :file_as)
            """,
            {"name": author.name, "file_as": author.file_as},
        )

        author_id = cast(int, cursor.lastrowid)

        cursor.execute(
            """
            INSERT INTO author_to_book (book_id, author_id, role) VALUES (:book_id, :author_id, :role)
            """,
            {"book_id": book_id, "author_id": author_id, "role": author.role},
        )

        book.authors.append(
            BookAuthor(
                id=author_id, name=author.name, file_as=author.file_as, role=author.role
            )
        )

    cursor.close()
    connection.commit()

    return book


def add_audiofile(book_id: int, audio_filename: str):
    connection.execute(
        """
        UPDATE book SET audio_filename = :audio_filename where id = :book_id
        """,
        {"book_id": book_id, "audio_filename": audio_filename},
    )

    connection.commit()


def get_book(book_id: int):
    cursor = connection.execute(
        """
        SELECT id, title, epub_filename, audio_filename
        FROM book
        WHERE id = :book_id
        """,
        {"book_id": book_id},
    )

    id, title, epub_filename, audio_filename = cursor.fetchone()

    return Book(
        id=id, title=title, epub_filename=epub_filename, audio_filename=audio_filename
    )


def get_books():
    cursor = connection.execute(
        """
        SELECT id, title, epub_filename, audio_filename
        FROM book
        """
    )

    return [
        Book(
            id=id,
            title=title,
            epub_filename=epub_filename,
            audio_filename=audio_filename,
        )
        for id, title, epub_filename, audio_filename in cursor.fetchall()
    ]


def get_book_details(ids: list[int] | None = None):
    if ids is None:
        ids = []

    cursor = connection.execute(
        f"""
        SELECT book.id, book.title,
               author.id, author.name, author.file_as,
               author_to_book.role,
               processing_task.type, processing_task.status, processing_task.progress
        FROM book
        JOIN author_to_book ON book.id = author_to_book.book_id
        JOIN author on author_to_book.author_id = author.id
        JOIN processing_task ON book.id = processing_task.book_id
        {f"WHERE book.id IN ({','.join('?' * len(ids))})" if len(ids) > 0 else ""}
        """,
        ids,
    )

    books: Dict[int, BookDetail] = {}
    for row in cursor:
        (
            book_id,
            book_title,
            author_id,
            author_name,
            author_file_as,
            author_role,
            processing_task_type,
            processing_task_status,
            processing_task_progress,
        ) = row

        if book_id not in books:
            author = BookAuthor(
                id=author_id, name=author_name, file_as=author_file_as, role=author_role
            )

            book = BookDetail(
                id=book_id,
                title=book_title,
                authors=[author],
                processing_status=None
                if processing_task_status == ProcessingTaskStatus.COMPLETED
                else ProcessingStatus(
                    current_task=processing_task_type,
                    progress=processing_task_progress,
                    in_error=processing_task_status == ProcessingTaskStatus.IN_ERROR,
                ),
            )

            books[book_id] = book

        else:
            book = books[book_id]

            author = next(filter(lambda a: a.id == author_id, book.authors), None)

            if author is None:
                author = BookAuthor(
                    id=author_id,
                    name=author_name,
                    file_as=author_file_as,
                    role=author_role,
                )
                book.authors.append(author)

            if (
                book.processing_status is None
                and processing_task_status != ProcessingTaskStatus.COMPLETED
            ):
                book.processing_status = ProcessingStatus(
                    current_task=processing_task_type,
                    progress=processing_task_progress,
                    in_error=processing_task_status == ProcessingTaskStatus.IN_ERROR,
                )

    return list(books.values())
