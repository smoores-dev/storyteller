from dataclasses import dataclass
import os
from pathlib import Path, PurePath
import shutil
from typing import BinaryIO, cast
from zipfile import ZipFile

from fastapi import UploadFile

from storyteller.synchronize.audio import (
    get_audio_directory,
    get_original_audio_filepath,
    get_custom_audio_cover_filepath,
)
from storyteller.synchronize.epub import get_epub_filepath


class UnsupportedMediaTypeError(Exception):
    def __init__(self, media_type: str):
        self.media_type = media_type


def persist_to_disk(fsrc: BinaryIO, filepath: PurePath | str):
    dirname = os.path.dirname(filepath)
    Path(dirname).mkdir(parents=True, exist_ok=True)

    with open(filepath, mode="w+b") as fdst:
        shutil.copyfileobj(fsrc, fdst)


def persist_epub(book_uuid: str, fsrc: BinaryIO):
    persist_to_disk(fsrc, get_epub_filepath(book_uuid))


def persist_audio(book_uuid: str, files: list[UploadFile]):
    for file in files:
        filename = cast(str, file.filename)
        filepath = get_original_audio_filepath(book_uuid, filename)
        persist_to_disk(file.file, filepath)


def persist_audio_cover(book_uuid: str, filetype: str, fsrc: BinaryIO):
    persist_to_disk(fsrc, get_custom_audio_cover_filepath(book_uuid, filetype))
