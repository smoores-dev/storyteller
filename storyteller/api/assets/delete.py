import os
import shutil

from storyteller.synchronize.audio import (
    get_audio_directory,
    get_processed_audio_filepath,
    get_audio_index_path,
)
from storyteller.synchronize.epub import get_epub_directory, get_epub_synced_directory
from storyteller.synchronize.sync import get_sync_cache_path


def delete_epub(book_uuid: str):
    shutil.rmtree(get_epub_directory(book_uuid), ignore_errors=True)


def delete_synced_epub(book_uuid: str):
    shutil.rmtree(get_epub_synced_directory(book_uuid), ignore_errors=True)


def delete_audio(book_uuid: str):
    shutil.rmtree(get_audio_directory(book_uuid), ignore_errors=True)


def delete_processed_audio(book_uuid: str):
    shutil.rmtree(get_processed_audio_filepath(book_uuid))


def delete_sync_cache(book_uuid: str):
    try:
        os.remove(get_sync_cache_path(book_uuid))
    except:
        pass


def delete_processed_files_cache(book_uuid: str):
    try:
        os.remove(get_audio_index_path(book_uuid))
    except:
        pass


def delete_assets(book_uuid: str):
    delete_epub(book_uuid)
    delete_audio(book_uuid)
    delete_sync_cache(book_uuid)


def delete_processed(book_uuid: str):
    delete_synced_epub(book_uuid)
    delete_processed_audio(book_uuid)
    delete_processed_files_cache(book_uuid)
    delete_sync_cache(book_uuid)
