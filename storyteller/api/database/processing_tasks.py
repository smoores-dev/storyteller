from dataclasses import dataclass
from typing import cast
from .connection import connection


class ProcessingTaskType:
    SPLIT_CHAPTERS = "SPLIT_CHAPTERS"
    TRANSCRIBE_CHAPTERS = "TRANSCRIBE_CHAPTERS"
    SYNC_CHAPTERS = "SYNC_CHAPTERS"


class ProcessingTaskStatus:
    STARTED = "STARTED"
    COMPLETED = "COMPLETED"
    IN_ERROR = "IN_ERROR"


processing_tasks_order = [
    ProcessingTaskType.SPLIT_CHAPTERS,
    ProcessingTaskType.TRANSCRIBE_CHAPTERS,
    ProcessingTaskType.SYNC_CHAPTERS,
]


@dataclass
class ProcessingTask:
    id: int | None
    type: str
    status: str
    progress: float
    book_id: int


def create_processing_task(type: str, status: str, book_id: int):
    cursor = connection.execute(
        """
        INSERT INTO processing_task (type, status, book_id)
        VALUES (:type, :status, :book_id)
        """,
        {"type": type, "status": status, "book_id": book_id},
    )

    connection.commit()
    return cast(int, cursor.lastrowid)


def get_processing_tasks_for_book(book_id: int):
    cursor = connection.execute(
        """
        SELECT id, type, status, progress, book_id
        FROM processing_task
        WHERE book_id = :book_id
        """,
        {"book_id": book_id},
    )

    connection.commit()
    return [
        ProcessingTask(id, type, status, progress, book_id)
        for id, type, status, progress, book_id in cursor
    ]


def reset_processing_tasks_for_book(book_id: int):
    connection.execute(
        """
        UPDATE processing_task
        SET progress = 0.0, status = 'STARTED'
        WHERE book_id = :book_id
        """,
        {"book_id": book_id},
    )

    connection.commit()


def update_task_progress(task_id: int, progress: float):
    connection.execute(
        """
        UPDATE processing_task
        SET progress = :progress
        WHERE id = :task_id
        """,
        {"task_id": task_id, "progress": progress},
    )

    connection.commit()


def update_task_status(task_id: int, status: str):
    connection.execute(
        """
        UPDATE processing_task
        SET status = :status
        WHERE id = :task_id
        """,
        {"task_id": task_id, "status": status},
    )

    connection.commit()
