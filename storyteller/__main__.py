import json
from typing import Any, Dict, List
from thefuzz import process
from ebooklib import epub
from mutagen.mp4 import MP4
import os
import sys
import argparse

from .audio import get_transcription_text, split_audiobook, transcribe_chapter
from .epub import (
    format_duration,
    get_chapter_text,
    read_epub,
    get_chapters,
    sync_chapter,
    update_synced_chapter,
)


class HiddenPrints:
    def __enter__(self):
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        sys.stdout = open(os.devnull, "w")
        sys.stderr = open(os.devnull, "w")

    def __exit__(self, exc_type, exc_val, exc_tb):
        sys.stdout.close()
        sys.stdout = self._original_stdout
        sys.stderr.close()
        sys.stderr = self._original_stderr


def find_best_match(
    epub_text: str, transcription_texts: List[str], last_match_index: int
):
    i = 0
    while i < len(transcription_texts):
        start_index = (last_match_index + i) % len(transcription_texts)
        end_index = (start_index + 3) % len(transcription_texts)
        if end_index > start_index:
            transcription_texts_slice = transcription_texts[start_index:end_index]
        else:
            transcription_texts_slice = (
                transcription_texts[start_index:] + transcription_texts[:end_index]
            )
        with HiddenPrints():
            extracted = process.extractOne(
                epub_text, transcription_texts_slice, score_cutoff=90
            )
            if extracted:
                return extracted
        i += 3
    return None


def main(book_name: str):
    with HiddenPrints():
        audio_chapter_filenames = split_audiobook(book_name)
    print(f"Split audiobook into {len(audio_chapter_filenames)} chapters")
    book = read_epub(book_name)
    epub_chapters = get_chapters(book)
    print(f"Found {len(epub_chapters)} chapters in the ebook")
    with HiddenPrints():
        transcriptions = [transcribe_chapter(f) for f in audio_chapter_filenames]
    print("Transcribed audiobook chapters")
    transcription_texts = [
        get_transcription_text(transcription) for transcription in transcriptions
    ]
    book_cache: Dict[str, Any] = {}
    if os.path.exists(f"cache/{book_name}.json"):
        with open(f"cache/{book_name}.json", "r") as cache_file:
            book_cache = json.load(cache_file)
    if "chapter_index" not in book_cache:
        book_cache["chapter_index"] = {}
    total_duration = 0
    last_transcription_index = 0
    for index, chapter in enumerate(epub_chapters):
        print()
        epub_text = get_chapter_text(chapter)
        epub_intro = epub_text[:60].replace("\n", " ")
        print(f"Syncing chapter #{index} ({epub_intro}...)")
        try:
            transcription_index = book_cache["chapter_index"][str(index)]
            score = None
            if transcription_index is None:
                continue
        except:
            extracted = find_best_match(
                epub_text,
                transcription_texts,
                last_transcription_index + 1,
            )
            if extracted is None:
                print(f"Couldn't find matching transcription for chapter #{index}")
                book_cache["chapter_index"][str(index)] = None
                with open(f"cache/{book_name}.json", "w") as cache_file:
                    json.dump(book_cache, cache_file)
                continue
            extracted_transcription, score = extracted
            transcription_index = transcription_texts.index(extracted_transcription)

        print(
            f"Chapter #{index} best matches transcription #{transcription_index} ({'cached' if score is None else score})"
        )

        book_cache["chapter_index"][str(index)] = transcription_index
        with open(f"cache/{book_name}.json", "w") as cache_file:
            json.dump(book_cache, cache_file)
        transcription = transcriptions[transcription_index]
        audio_filename = audio_chapter_filenames[transcription_index]
        print(f"Syncing with audio file {audio_filename}")
        synced = sync_chapter(MP4(audio_filename), transcription, chapter)
        update_synced_chapter(book, synced)
        last_transcription_index = transcription_index
        total_duration += synced.duration
        print(f"New total duration is {total_duration}s")

    book.add_metadata(
        None, "meta", format_duration(total_duration), {"property": "media:duration"}
    )
    book.add_metadata(
        None, "meta", "-epub-media-overlay-active", {"property": "media:active-class"}
    )
    book.add_item(
        epub.EpubItem(
            uid="storyteller_readaloud_styles",
            file_name="Styles/storyteller-readaloud.css",
            media_type="text/css",
            content=".-epub-media-overlay-active { background-color: #ffb; }".encode(),
        )
    )
    epub.write_epub(f"assets/text/{book_name}/synced/{book_name}.epub", book)


parser = argparse.ArgumentParser(
    prog="storyteller",
    description="Given a book name, update the ebook file with media overlays for the audiobook",
)

parser.add_argument("book_name")

args = parser.parse_args()

main(args.book_name)
