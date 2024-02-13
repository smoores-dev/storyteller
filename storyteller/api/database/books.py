from dataclasses import dataclass
from typing import Dict, List, cast

from storyteller.synchronize.epub import EpubAuthor

from ..models import Book, BookAuthor, BookDetail, ProcessingStatus

from .processing_tasks import (
    ProcessingTask,
    ProcessingTaskStatus,
    processing_tasks_order,
)
from .connection import connection


def get_book_uuid(book_id_or_uuid: str) -> str:
    """
    This function only exists to support old clients that haven't
    started using UUIDs yet. It's not particularly efficient and should
    be removed after we feel confident that all clients (specifically,
    mobile apps) have likely been updated.
    """

    if "-" in book_id_or_uuid:
        # This is already a UUID, so just return it
        return book_id_or_uuid

    # Otherwise, parse into an int and fetch the UUID from the db
    book_id = int(book_id_or_uuid)
    cursor = connection.execute(
        """
        SELECT uuid
        FROM book
        WHERE id = :book_id
        """,
        {"book_id": book_id},
    )

    (book_uuid,) = cursor.fetchone()
    return book_uuid


def create_book(title: str, authors: List[EpubAuthor]) -> BookDetail:
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO book (title) VALUES (:title)
        RETURNING uuid
        """,
        {"title": title},
    )

    (book_uuid,) = cursor.fetchone()
    book = BookDetail(
        uuid=book_uuid, id=None, title=title, authors=[], processing_status=None
    )

    for author in authors:
        cursor.execute(
            """
            INSERT INTO author (name, file_as) VALUES (:name, :file_as)
            RETURNING uuid
            """,
            {"name": author.name, "file_as": author.file_as},
        )

        (author_uuid,) = cursor.fetchone()

        cursor.execute(
            """
            INSERT INTO author_to_book (book_uuid, author_uuid, role) VALUES (:book_uuid, :author_uuid, :role)
            """,
            {"book_uuid": book_uuid, "author_uuid": author_uuid, "role": author.role},
        )

        book.authors.append(
            BookAuthor(
                uuid=author_uuid,
                name=author.name,
                file_as=author.file_as,
                role=author.role,
            )
        )

    connection.commit()

    return book


def add_audiofile(book_uuid: str, audio_filename: str, audio_filetype: str):
    connection.execute(
        """
        UPDATE book
        SET audio_filename = :audio_filename,
            audio_filetype = :audio_filetype
        WHERE uuid = :book_uuid
        """,
        {
            "book_uuid": book_uuid,
            "audio_filename": audio_filename,
            "audio_filetype": audio_filetype,
        },
    )

    connection.commit()


def get_book(book_uuid: str):
    cursor = connection.execute(
        """
        SELECT uuid, id, title
        FROM book
        WHERE uuid = :book_uuid
        """,
        {"book_uuid": book_uuid},
    )

    uuid, id, title = cursor.fetchone()

    return Book(
        uuid=uuid,
        id=id,
        title=title,
    )


@dataclass
class LegacyBook:
    uuid: str
    id: int
    title: str
    epub_filename: str | None
    audio_filename: str | None
    audio_filetype: str | None


def get_books_legacy_():
    cursor = connection.execute(
        """
        SELECT uuid, id, title, epub_filename, audio_filename, audio_filetype
        FROM book
        WHERE epub_filename != NULL OR audio_filename != NULL
        """
    )

    return [
        LegacyBook(
            uuid=uuid,
            id=id,
            title=title,
            epub_filename=epub_filename,
            audio_filename=audio_filename,
            audio_filetype=audio_filetype,
        )
        for uuid, id, title, epub_filename, audio_filename, audio_filetype in cursor.fetchall()
    ]


def clear_filename_columns(book_uuid: str):
    connection.execute(
        """
        UPDATE book
        SET
            epub_filename=null,
            audio_filename=null
        WHERE
            book.uuid = :book_uuid
        """,
        {"book_uuid": book_uuid},
    )

    connection.commit()


def get_books():
    cursor = connection.execute(
        """
        SELECT uuid, id, title
        FROM book
        """
    )

    return [
        Book(
            uuid=uuid,
            id=id,
            title=title,
        )
        for uuid, id, title in cursor.fetchall()
    ]


def get_book_details(uuids: list[str] | None = None, synced_only=False):
    if uuids is None:
        uuids = []

    cursor = connection.execute(
        f"""
        SELECT book.uuid, book.id, book.title
        FROM book
        {f"WHERE book.uuid IN ({','.join('?' * len(uuids))})" if len(uuids) > 0 else ""}
        """,
        uuids,
    )

    books: Dict[int, BookDetail] = {}
    selected_book_uuids: list[str] = []
    for row in cursor:
        book_uuid, book_id, book_title = row

        books[book_uuid] = BookDetail(
            uuid=book_uuid,
            id=book_id,
            title=book_title,
            authors=[],
            processing_status=None,
        )
        selected_book_uuids.append(book_uuid)

    cursor = connection.execute(
        f"""
        SELECT author.uuid, author.name, author.file_as,
               author_to_book.role, author_to_book.book_uuid
        FROM author
        JOIN author_to_book on author_to_book.author_uuid = author.uuid
        {f"WHERE author_to_book.book_uuid IN ({','.join('?' * len(selected_book_uuids))})"}
        """,
        selected_book_uuids,
    )

    for row in cursor:
        author_uuid, author_name, author_file_as, author_role, book_uuid = row

        if book_uuid not in books:
            continue

        books[book_uuid].authors.append(
            BookAuthor(
                uuid=author_uuid,
                name=author_name,
                file_as=author_file_as,
                role=author_role,
            )
        )

    cursor = connection.execute(
        f"""
        SELECT uuid, type, status, progress, book_uuid
        FROM processing_task
        {f"WHERE book_uuid IN ({','.join('?' * len(selected_book_uuids))})"}
        """,
        selected_book_uuids,
    )

    processing_tasks: dict[int, list[ProcessingTask]] = {}
    for row in cursor:
        (
            processing_task_uuid,
            processing_task_type,
            processing_task_status,
            processing_task_progress,
            book_uuid,
        ) = row

        if book_uuid not in processing_tasks:
            processing_tasks[book_uuid] = []

        processing_tasks[book_uuid].append(
            ProcessingTask(
                uuid=processing_task_uuid,
                type=processing_task_type,
                status=processing_task_status,
                progress=processing_task_progress,
                book_uuid=book_uuid,
            )
        )

    for book_uuid, tasks in processing_tasks.items():
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

        books[book_uuid].processing_status = ProcessingStatus(
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


def delete_book(uuid: str):
    connection.execute(
        """
        DELETE FROM processing_task
        WHERE book_uuid = :book_uuid
        """,
        {"book_uuid": uuid},
    )

    connection.execute(
        """
        DELETE FROM author_to_book
        WHERE book_uuid = :book_uuid
        """,
        {"book_uuid": uuid},
    )

    connection.execute(
        """
        DELETE FROM author
        WHERE author.uuid
        NOT IN (
            SELECT author_uuid
            FROM author_to_book
        )
        """
    )

    connection.execute(
        """
        DELETE FROM book
        WHERE uuid = :book_uuid
        """,
        {"book_uuid": uuid},
    )

    connection.commit()
