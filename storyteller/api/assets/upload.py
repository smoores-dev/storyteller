import os
from pathlib import Path
import shutil
from typing import BinaryIO

from storyteller.synchronize.audio import get_audio_filepath
from storyteller.synchronize.epub import get_epub_filepath


def persist_to_disk(fsrc: BinaryIO, filepath: str):
    dirname = os.path.dirname(filepath)
    Path(dirname).mkdir(parents=True, exist_ok=True)

    with open(filepath, mode="w+b") as fdst:
        shutil.copyfileobj(fsrc, fdst)


def persist_epub(book_name: str, fsrc: BinaryIO):
    persist_to_disk(fsrc, get_epub_filepath(book_name))


def persist_audio(book_name: str, filetype: str, fsrc: BinaryIO):
    persist_to_disk(fsrc, get_audio_filepath(book_name, filetype))
