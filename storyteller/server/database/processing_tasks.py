from typing import Union
from .connection import connection
from enum import Enum


class ProcessingTaskType:
    SPLIT_CHAPTERS = "SPLIT_CHAPTERS"
    TRANSCRIBE_CHAPTERS = "TRANSCRIBE_CHAPTERS"
    SYNC_CHAPTERS = "SYNC_CHAPTERS"


def create_processing_task(type: str, book_id: int):
    connection.execute(
        """
        INSERT INTO processing_task VALUES (:type, :book_id)
        """,
        {"type": type, "book_id": book_id},
    )
