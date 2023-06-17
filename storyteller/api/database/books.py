from dataclasses import dataclass
from typing import Dict, List, Set, cast
from storyteller.api.database.processing_tasks import (
    ProcessingTaskStatus,
)

from storyteller.synchronize.epub import EpubAuthor

from .connection import connection


@dataclass
class Book:
    id: int
    title: str
    epub_filename: str
    audio_filename: str | None


@dataclass
class Author:
    id: int
    name: str
    file_as: str


@dataclass
class BookAuthor:
    id: int
    name: str
    file_as: str
    role: str


@dataclass
class ProcessingStatus:
    current_task: str
    progress: float


@dataclass
class BookDetail:
    id: int
    title: str
    authors: List[BookAuthor]
    processing_status: ProcessingStatus | None


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

    return Book(id, title, epub_filename, audio_filename)


def get_books():
    cursor = connection.execute(
        """
        SELECT id, title, epub_filename, audio_filename
        FROM book
        """
    )

    return [
        Book(id, title, epub_filename, audio_filename)
        for id, title, epub_filename, audio_filename in cursor.fetchall()
    ]


def get_book_details():
    cursor = connection.execute(
        """
        SELECT book.id, book.title,
               author.id, author.name, author.file_as,
               author_to_book.role,
               processing_task.type, processing_task.status
        FROM book
        JOIN author_to_book ON book.id = author_to_book.book_id
        JOIN author on author_to_book.author_id = author.id
        JOIN processing_task ON book.id = processing_task.book_id
        """
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
        ) = row

        if book_id not in books:
            author = BookAuthor(author_id, author_name, author_file_as, author_role)

            book = BookDetail(
                book_id,
                book_title,
                [author],
                None
                if processing_task_status != ProcessingTaskStatus.COMPLETED
                else ProcessingStatus(processing_task_type, 0),
            )

            books[book_id] = book
        
        else:
            book = books[book_id]

            author = next(filter(lambda a: a.id == author_id, book.authors), None)

            if author is None:
                author = BookAuthor(author_id, author_name, author_file_as, author_role)
                book.authors.append(author)

            if book.processing_status is None and processing_task_status == ProcessingTaskStatus.COMPLETED:
                book.processing_status = ProcessingStatus(processing_task_type, 0)
            
    return list(books.values())

