import os
from pathlib import Path
import shutil
from .. import database as db
from storyteller.synchronize.files import AUDIO_DIR, TEXT_DIR, CACHE_DIR, StrPath
from storyteller.synchronize import epub, audio, sync


def migrate_epub_to_uuids(uuid: str, epub_bare_filename: str | None):
    if epub_bare_filename is None:
        return

    old_epub_filename = f"{epub_bare_filename}.epub"

    old_epub_directory = Path(TEXT_DIR, epub_bare_filename)
    old_original_epub_filepath = Path(old_epub_directory, "original", old_epub_filename)
    old_synced_epub_filepath = Path(old_epub_directory, "synced", old_epub_filename)

    new_original_epub_filepath = epub.get_epub_filepath(uuid)
    new_original_epub_filepath.parent.mkdir(parents=True, exist_ok=True)
    new_synced_epub_filepath = Path(
        epub.get_epub_synced_directory(uuid), f"{uuid}.epub"
    )
    new_synced_epub_filepath.parent.mkdir(parents=True, exist_ok=True)

    try:
        shutil.move(old_original_epub_filepath, new_original_epub_filepath)
    except:
        pass

    try:
        shutil.move(old_synced_epub_filepath, new_synced_epub_filepath)
    except:
        pass


def migrate_audio_to_uuids(
    uuid: str, audio_bare_filename: str | None, audio_filetype: str | None
):
    if audio_bare_filename is None or audio_filetype is None:
        return

    old_audio_filename = f"{audio_bare_filename}.{audio_filetype}"
    old_audio_directory = Path(AUDIO_DIR, audio_bare_filename)
    old_original_audio_filepath = Path(
        old_audio_directory, "original", old_audio_filename
    )
    old_chapters_audio_directory = Path(old_audio_directory, "chapters")
    old_transcriptions_audio_directory = Path(old_audio_directory, "transcriptions")

    new_original_audio_filepath = audio.get_original_audio_filepath(
        uuid, old_audio_filename
    )
    new_original_audio_filepath.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.move(old_original_audio_filepath, new_original_audio_filepath)
    except:
        pass

    audio_files: list[audio.AudioFile] = []

    try:
        chapters_filenames = os.listdir(old_chapters_audio_directory)
    except:
        chapters_filenames = []

    for filename in chapters_filenames:
        old_chapter_filepath = Path(old_chapters_audio_directory, filename)
        new_processed_filepath = audio.get_processed_audio_filepath(uuid, filename)
        new_processed_filepath.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.move(old_chapter_filepath, new_processed_filepath)
            path = Path(filename)
            bare_filename = path.stem
            ext = path.suffix
            audio_files.append(
                audio.AudioFile(
                    filename=filename, bare_filename=bare_filename, extension=ext
                )
            )
        except:
            pass

    audio.persist_processed_files_list(uuid, audio_files)

    try:
        transcriptions_filenames = os.listdir(old_transcriptions_audio_directory)
    except:
        transcriptions_filenames = []

    for filename in transcriptions_filenames:
        old_transcription_filepath = Path(old_transcriptions_audio_directory, filename)
        new_transcription_filepath = audio.get_transcription_filepath(
            uuid,
            # Trim off the .json extension
            filename[:-5],
        )
        new_transcription_filepath.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.move(old_transcription_filepath, new_transcription_filepath)
        except:
            pass


def migrate_sync_cache_to_uuids(uuid: str, epub_bare_filename: str | None):
    if epub_bare_filename is None:
        return

    old_cache_filepath = Path(CACHE_DIR, f"{epub_bare_filename}.json")
    new_cache_filepath = sync.get_sync_cache_path(uuid)

    try:
        shutil.move(old_cache_filepath, new_cache_filepath)
    except:
        pass


def migrate_to_uuids():
    print("Migrating asset organization")
    books = db.get_books_legacy_()
    for book in books:
        print(f"Migrating book {book.uuid} ({book.title})")
        migrate_epub_to_uuids(book.uuid, book.epub_filename)
        migrate_audio_to_uuids(book.uuid, book.audio_filename, book.audio_filetype)
        migrate_sync_cache_to_uuids(book.uuid, book.epub_filename)
        db.clear_filename_columns(book.uuid)
    print("Done.")
