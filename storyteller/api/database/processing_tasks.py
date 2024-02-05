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
    uuid: str | None
    type: str
    status: str
    progress: float
    book_uuid: str


def create_processing_task(type: str, status: str, book_uuid: str):
    cursor = connection.execute(
        """
        INSERT INTO processing_task (type, status, book_uuid)
        VALUES (:type, :status, :book_uuid)
        RETURNING uuid
        """,
        {"type": type, "status": status, "book_uuid": book_uuid},
    )

    connection.commit()
    return cast(str, cursor.fetchone()[0])


def get_processing_tasks_for_book(book_uuid: str):
    cursor = connection.execute(
        """
        SELECT uuid, type, status, progress, book_uuid
        FROM processing_task
        WHERE book_uuid = :book_uuid
        """,
        {"book_uuid": book_uuid},
    )

    connection.commit()
    return [
        ProcessingTask(uuid, type, status, progress, book_uuid)
        for uuid, type, status, progress, book_uuid in cursor
    ]


def reset_processing_tasks_for_book(book_uuid: str):
    connection.execute(
        """
        UPDATE processing_task
        SET progress = 0.0, status = 'STARTED'
        WHERE book_uuid = :book_uuid
        """,
        {"book_uuid": book_uuid},
    )

    connection.commit()


def update_task_progress(task_uuid: int, progress: float):
    connection.execute(
        """
        UPDATE processing_task
        SET progress = :progress
        WHERE uuid = :task_uuid
        """,
        {"task_uuid": task_uuid, "progress": progress},
    )

    connection.commit()


def update_task_status(task_uuid: str, status: str):
    connection.execute(
        """
        UPDATE processing_task
        SET status = :status
        WHERE uuid = :task_uuid
        """,
        {"task_uuid": task_uuid, "status": status},
    )

    connection.commit()
