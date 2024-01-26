import functools
from typing import Dict, List, cast
from multiprocessing import Process
from threading import Thread

from storyteller.synchronize.audio import split_audiobook, transcribe_book
from storyteller.synchronize.sync import sync_book

from .database import (
    get_book,
    ProcessingTask,
    ProcessingTaskStatus,
    ProcessingTaskType,
    create_processing_task,
    get_processing_tasks_for_book,
    reset_processing_tasks_for_book,
    processing_tasks_order,
    update_task_progress,
    update_task_status,
)

from .config import config

from .models import Book


def determine_remaining_tasks(
    book_id: int, processing_tasks: List[ProcessingTask]
) -> List[ProcessingTask]:
    if len(processing_tasks) == 0:
        return [
            ProcessingTask(None, type, ProcessingTaskStatus.STARTED, 0, book_id)
            for type in processing_tasks_order
        ]

    last_task = processing_tasks[-1]
    if last_task.status == ProcessingTaskStatus.COMPLETED:
        next_task_type_index = processing_tasks_order.index(last_task.type) + 1
        if next_task_type_index == len(processing_tasks_order):
            return []

        return [
            ProcessingTask(None, task, ProcessingTaskStatus.STARTED, 0, book_id)
            for task in processing_tasks_order[next_task_type_index:]
        ]

    completed_tasks = [
        task
        for task in processing_tasks
        if task.status == ProcessingTaskStatus.COMPLETED
    ]

    return processing_tasks[len(completed_tasks) :] + [
        ProcessingTask(None, task, ProcessingTaskStatus.STARTED, 0, book_id)
        for task in processing_tasks_order[len(processing_tasks) :]
    ]


def process(book: Book, processing_tasks: List[ProcessingTask]):
    for processing_task in processing_tasks:
        if processing_task.id is None:
            processing_task.id = create_processing_task(
                processing_task.type,
                processing_task.status,
                processing_task.book_id,
            )
        if processing_task.status != ProcessingTaskStatus.STARTED:
            update_task_status(processing_task.id, ProcessingTaskStatus.STARTED)

        on_progress = functools.partial(
            update_task_progress, cast(int, processing_task.id)
        )

        if processing_task.type == ProcessingTaskType.SPLIT_CHAPTERS:
            p = Process(
                target=split_audiobook,
                args=[book.audio_filename, book.audio_filetype, on_progress],
            )
        elif processing_task.type == ProcessingTaskType.TRANSCRIBE_CHAPTERS:
            p = Process(
                target=transcribe_book,
                args=[
                    book.audio_filename,
                    book.epub_filename,
                    config.device,
                    config.batch_size,
                    config.compute_type,
                    on_progress,
                ],
            )
        elif processing_task.type == ProcessingTaskType.SYNC_CHAPTERS:
            p = Process(
                target=sync_book,
                args=[book.epub_filename, book.audio_filename, on_progress],
            )
        else:
            raise KeyError(
                f"next task has an invalid task type: {processing_task.type}"
            )

        p.start()
        p.join()

        # TODO: Would be good to handle sigint/sigterm/sigkill somehow
        if p.exitcode == 0:
            update_task_status(processing_task.id, ProcessingTaskStatus.COMPLETED)
        else:
            update_task_status(processing_task.id, ProcessingTaskStatus.IN_ERROR)
            return


def start_processing(book_id: int, restart: bool):
    book = get_book(book_id)
    if book.audio_filename is None:
        raise KeyError("Book does not have an audio_filename")

    if restart:
        reset_processing_tasks_for_book(book_id)

    processing_tasks = get_processing_tasks_for_book(book_id)
    processing_tasks.sort(key=lambda t: processing_tasks_order.index(t.type))

    remaining_tasks = determine_remaining_tasks(book_id, processing_tasks)

    print(f"Found {len(remaining_tasks)} remaining processing tasks for book {book_id}")

    thread = Thread(target=process, args=[book, remaining_tasks])
    thread.start()
