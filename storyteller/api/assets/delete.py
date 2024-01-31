import os
import shutil

from storyteller.synchronize.audio import (
    get_audio_directory,
)
from storyteller.synchronize.epub import get_epub_directory
from storyteller.synchronize.sync import get_sync_cache_path


def delete_epub(book_name: str):
    shutil.rmtree(get_epub_directory(book_name), ignore_errors=True)


def delete_audio(book_name: str | None):
    if book_name is None:
        return
    shutil.rmtree(get_audio_directory(book_name), ignore_errors=True)


def delete_sync_cache(book_name: str):
    try:
        os.remove(get_sync_cache_path(book_name))
    except:
        pass


def delete_assets(epub_filename: str, audio_filename: str | None):
    delete_epub(epub_filename)
    delete_audio(audio_filename)
    delete_sync_cache(epub_filename)
