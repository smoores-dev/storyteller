from dataclasses import dataclass
from typing import Union, cast
from .connection import connection
from enum import Enum


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
    book_id: int

    def __hash__(self):
        return hash(self.id)


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
        SELECT id, type, status, book_id
        FROM processing_task
        WHERE book_id = :book_id
        """,
        {"book_id": book_id},
    )

    connection.commit()
    return [
        ProcessingTask(id, type, status, book_id)
        for id, type, status, book_id in cursor
    ]


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
