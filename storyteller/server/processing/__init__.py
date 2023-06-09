import logging
from typing import List
from multiprocessing import Process
from threading import Thread

from storyteller.synchronize.audio import split_audiobook, transcribe_book
from storyteller.synchronize.sync import sync_book

from ..database import (
    get_book,
    ProcessingTask,
    ProcessingTaskStatus,
    ProcessingTaskType,
    create_processing_task,
    get_processing_tasks_for_book,
    processing_tasks_order,
    update_task_status,
)

processes = set()


def determine_next_task(book_id: int, processing_tasks: List[ProcessingTask]):
    if len(processing_tasks) == 0:
        return ProcessingTask(
            None,
            ProcessingTaskType.SPLIT_CHAPTERS,
            ProcessingTaskStatus.STARTED,
            book_id,
        )

    last_task = processing_tasks[-1]
    if last_task.status == ProcessingTaskStatus.COMPLETED:
        next_task_type_index = processing_tasks_order.index(last_task.type) + 1
        if next_task_type_index == len(processing_tasks_order):
            return None

        return ProcessingTask(
            None,
            processing_tasks_order[next_task_type_index],
            ProcessingTaskStatus.STARTED,
            book_id,
        )

    return last_task


def start_processing(book_id: int):
    book = get_book(book_id)
    processing_tasks = get_processing_tasks_for_book(book_id)
    next_task = determine_next_task(book_id, processing_tasks)
    if next_task is None:
        return

    if next_task.id is None:
        next_task.id = create_processing_task(
            next_task.type, next_task.status, next_task.book_id
        )
    else:
        if next_task in processes:
            return

    processes.add(next_task)

    if book.audio_filename is None:
        raise KeyError("Book does not have an audio_filename")

    print("Kicking off processing task")

    def process(p: Process):
        print("Kicking off new process")
        p.start()
        p.join()
        if p.exitcode == 0:
            update_task_status(next_task.id, ProcessingTaskStatus.COMPLETED)
        else:
            update_task_status(next_task.id, ProcessingTaskStatus.IN_ERROR)

    if next_task.type == ProcessingTaskType.SPLIT_CHAPTERS:
        p = Process(target=split_audiobook, args=[book.audio_filename])
    elif next_task.type == ProcessingTaskType.TRANSCRIBE_CHAPTERS:
        p = Process(target=transcribe_book, args=[book.audio_filename])
    elif next_task.type == ProcessingTaskType.SYNC_CHAPTERS:
        p = Process(target=sync_book, args=[book.epub_filename, book.audio_filename])
    else:
        raise KeyError(f"next task has an invalid task type: {next_task.type}")

    thread = Thread(target=process, args=[p])
    thread.start()
