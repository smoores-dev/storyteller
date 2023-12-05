from typing import Dict, List, cast

from storyteller.synchronize.epub import EpubAuthor

from ..models import Book, BookAuthor, BookDetail, ProcessingStatus

from .processing_tasks import (
    ProcessingTask,
    ProcessingTaskStatus,
    processing_tasks_order,
)
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


def add_audiofile(book_id: int, audio_filename: str, audio_filetype: str):
    connection.execute(
        """
        UPDATE book
        SET audio_filename = :audio_filename,
            audio_filetype = :audio_filetype
        WHERE id = :book_id
        """,
        {
            "book_id": book_id,
            "audio_filename": audio_filename,
            "audio_filetype": audio_filetype,
        },
    )

    connection.commit()


def get_book(book_id: int):
    cursor = connection.execute(
        """
        SELECT id, title, epub_filename, audio_filename, audio_filetype
        FROM book
        WHERE id = :book_id
        """,
        {"book_id": book_id},
    )

    id, title, epub_filename, audio_filename, audio_filetype = cursor.fetchone()

    return Book(
        id=id,
        title=title,
        epub_filename=epub_filename,
        audio_filename=audio_filename,
        audio_filetype=audio_filetype,
    )


def get_books():
    cursor = connection.execute(
        """
        SELECT id, title, epub_filename, audio_filename, audio_filetype
        FROM book
        """
    )

    return [
        Book(
            id=id,
            title=title,
            epub_filename=epub_filename,
            audio_filename=audio_filename,
            audio_filetype=audio_filetype,
        )
        for id, title, epub_filename, audio_filename, audio_filetype in cursor.fetchall()
    ]


def get_book_details(ids: list[int] | None = None, synced_only=False):
    if ids is None:
        ids = []

    cursor = connection.execute(
        f"""
        SELECT book.id, book.title
        FROM book
        {f"WHERE book.id IN ({','.join('?' * len(ids))})" if len(ids) > 0 else ""}
        """,
        ids,
    )

    books: Dict[int, BookDetail] = {}
    selected_book_ids: list[int] = []
    for row in cursor:
        book_id, book_title = row

        books[book_id] = BookDetail(
            id=book_id, title=book_title, authors=[], processing_status=None
        )
        selected_book_ids.append(book_id)

    cursor = connection.execute(
        f"""
        SELECT author.id, author.name, author.file_as,
               author_to_book.role, author_to_book.book_id
        FROM author
        JOIN author_to_book on author_to_book.author_id = author.id
        {f"WHERE author_to_book.book_id IN ({','.join('?' * len(selected_book_ids))})"}
        """,
        selected_book_ids,
    )

    for row in cursor:
        author_id, author_name, author_file_as, author_role, book_id = row

        if book_id not in books:
            continue

        books[book_id].authors.append(
            BookAuthor(
                id=author_id, name=author_name, file_as=author_file_as, role=author_role
            )
        )

    cursor = connection.execute(
        f"""
        SELECT id, type, status, progress, book_id
        FROM processing_task
        {f"WHERE book_id IN ({','.join('?' * len(selected_book_ids))})"}
        """,
        selected_book_ids,
    )

    processing_tasks: dict[int, list[ProcessingTask]] = {}
    for row in cursor:
        (
            processing_task_id,
            processing_task_type,
            processing_task_status,
            processing_task_progress,
            book_id,
        ) = row

        if book_id not in processing_tasks:
            processing_tasks[book_id] = []

        processing_tasks[book_id].append(
            ProcessingTask(
                id=processing_task_id,
                type=processing_task_type,
                status=processing_task_status,
                progress=processing_task_progress,
                book_id=book_id,
            )
        )

    for book_id, tasks in processing_tasks.items():
        sorted_tasks = sorted(tasks, key=lambda t: processing_tasks_order.index(t.type))

        try:
            current_task = next(
                task
                for task in sorted_tasks
                if task.status != ProcessingTaskStatus.COMPLETED
            )
        except StopIteration:
            current_task = sorted_tasks[-1]

        if not current_task:
            continue

        books[book_id].processing_status = ProcessingStatus(
            current_task=current_task.type,
            progress=current_task.progress,
            in_error=current_task.status == ProcessingTaskStatus.IN_ERROR,
        )

    all_books_list = books.values()

    if synced_only:
        return [
            book
            for book in all_books_list
            if book.processing_status is not None
            and book.processing_status.current_task == "SYNC_CHAPTERS"
            and book.processing_status.progress == 1
            and not book.processing_status.in_error
        ]

    return list(books.values())
