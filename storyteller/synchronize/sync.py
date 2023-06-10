from dataclasses import dataclass
import json
import math
from typing import Any, Dict, List, cast
from fuzzysearch import Match, find_near_matches
from thefuzz import process
from ebooklib import epub
from mutagen.mp4 import MP4
import os
import sys
import whisperx.types
from nltk.tokenize import sent_tokenize

from .audio import (
    get_audio_chapter_filenames,
    get_transcriptions,
)
from .epub import (
    SentenceRange,
    create_media_overlay,
    get_chapter_sentences,
    get_chapter_text,
    read_epub,
    get_chapters,
    tag_sentences,
)


class NullIO:
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
        with NullIO():
            extracted = process.extractOne(
                epub_text, transcription_texts_slice, score_cutoff=90
            )
            if extracted:
                return extracted
        i += 3
    return None


def get_transcription_text(transcription: whisperx.types.AlignedTranscriptionResult):
    return " ".join([segment["text"] for segment in transcription["segments"]])


def find_timestamps(match_start_index, transcription):
    s = 0
    position = 0
    while True:
        while position + len(transcription["segments"][s]["text"]) < match_start_index:  # type: ignore
            position += len(transcription["segments"][s]["text"]) + 1  # type: ignore
            s += 1

        w = 0
        segment = transcription["segments"][s]
        while (
            w < len(segment["words"])
            and position + len(segment["words"][w]["word"]) <= match_start_index
        ):
            position += len(segment["words"][w]["word"]) + 1
            w += 1
        if w >= len(segment["words"]):
            s += 1
            continue

        break

    start_word = segment["words"][w]

    # If a segment only has one word, the start and
    # end timestamps are only placed on the segment
    if "start" in start_word:
        return start_word["start"]

    return segment["start"]


def get_chapter_timestamps(
    transcription: whisperx.types.AlignedTranscriptionResult,
    sentences: List[str],
    duration: float,
):
    sentence_ranges: List[SentenceRange] = []
    transcription_text = get_transcription_text(transcription).lower()
    transcription_sentences = sent_tokenize(transcription_text)
    transcription_window_index = 0
    last_good_transcription_window = 0
    not_found = 0

    sentence_index = 0
    while sentence_index < len(sentences):
        sentence = sentences[sentence_index]
        transcription_window = " ".join(
            transcription_sentences[
                transcription_window_index : transcription_window_index + 4
            ]
        )

        matches = find_near_matches(
            sentence.strip().lower(),
            transcription_window,
            max_l_dist=math.floor(0.25 * len(sentence)),
        )
        matches = cast(List[Match], matches)

        if len(matches) == 0:
            sentence_index += 1
            not_found += 1
            if not_found == 3:
                not_found = 0
                transcription_window_index += 1
                if transcription_window_index == len(transcription_sentences):
                    transcription_window_index = last_good_transcription_window
                    continue
                sentence_index -= 3
            continue

        not_found = 0
        last_good_transcription_window = transcription_window_index
        first_match = matches[0]

        transcription_offset = len(
            " ".join(transcription_sentences[:transcription_window_index])
        )
        start = find_timestamps(
            first_match.start + transcription_offset + 1, transcription
        )

        if len(sentence_ranges) > 0:
            sentence_ranges[-1].end = start

        sentence_ranges.append(SentenceRange(start, start, sentence_index))
        sentence_index += 1

    if len(sentence_ranges) > 0:
        sentence_ranges[0].start = 0
        sentence_ranges[-1].end = duration

    return sentence_ranges


@dataclass
class SyncedChapter:
    chapter: epub.EpubHtml
    audio: epub.EpubItem
    media_overlay: epub.EpubSMIL
    duration: float


def sync_chapter(
    mp4: MP4,
    transcription: whisperx.types.AlignedTranscriptionResult,
    chapter: epub.EpubHtml,
):
    chapter_sentences = get_chapter_sentences(chapter)
    timestamps = get_chapter_timestamps(
        transcription, chapter_sentences, mp4.info.length
    )
    tag_sentences(chapter)
    chapter_filepath_length = len(chapter.file_name.split(os.path.sep)) - 1
    relative_ups = "../" * chapter_filepath_length
    chapter.add_link(
        rel="stylesheet",
        href=f"{relative_ups}Styles/storyteller-readaloud.css",
        type="text/css",
    )
    base_filename, _ = os.path.splitext(os.path.basename(chapter.file_name))
    _, audio_ext = os.path.splitext(mp4.filename)  # type: ignore
    audio_item = epub.EpubItem(
        uid=f"{base_filename}_audio",
        file_name=f"Audio/{base_filename}{audio_ext}",
        content=open(mp4.filename, "rb").read(),  # type: ignore
        media_type="audio/mpeg",
    )
    media_overlay_item = epub.EpubSMIL(
        uid=f"{base_filename}_overlay",
        file_name=f"MediaOverlays/{base_filename}.smil",
        content=create_media_overlay(
            base_filename, chapter.file_name, audio_item.file_name, timestamps
        ),
    )
    chapter.media_overlay = media_overlay_item.id
    return SyncedChapter(
        chapter=chapter,
        audio=audio_item,
        media_overlay=media_overlay_item,
        duration=timestamps[-1].end if len(timestamps) else 0,
    )


def format_duration(duration: float):
    hours = math.floor(duration / 3600)
    minutes = math.floor(duration / 60 - hours * 3600)
    seconds = duration - minutes * 60 - hours * 3600
    return f"{str(hours).zfill(2)}:{str(minutes).zfill(2)}:{round(seconds, 3)}"


def update_synced_chapter(book: epub.EpubBook, synced: SyncedChapter):
    book.add_metadata(
        None,
        "meta",
        format_duration(synced.duration),
        {"property": "media:duration", "refines": f"#{synced.media_overlay.id}"},
    )

    book.add_item(synced.audio)
    book.add_item(synced.media_overlay)


def sync_book(ebook_name: str, audiobook_name: str):
    book = read_epub(ebook_name)
    epub_chapters = get_chapters(book)
    print(f"Found {len(epub_chapters)} chapters in the ebook")
    audio_chapter_filenames = get_audio_chapter_filenames(audiobook_name)
    transcriptions = get_transcriptions(audiobook_name)
    transcription_texts = [
        get_transcription_text(transcription) for transcription in transcriptions
    ]
    book_cache: Dict[str, Any] = {}
    if os.path.exists(f"cache/{ebook_name}.json"):
        with open(f"cache/{ebook_name}.json", "r") as cache_file:
            book_cache = json.load(cache_file)
    if "chapter_index" not in book_cache:
        book_cache["chapter_index"] = {}
    total_duration = 0
    last_transcription_index = 0
    for index, chapter in enumerate(epub_chapters):
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
                with open(f"cache/{ebook_name}.json", "w") as cache_file:
                    json.dump(book_cache, cache_file)
                continue
            extracted_transcription, score = extracted
            transcription_index = transcription_texts.index(extracted_transcription)

        print(
            f"Chapter #{index} best matches transcription #{transcription_index} ({'cached' if score is None else score})"
        )

        book_cache["chapter_index"][str(index)] = transcription_index
        with open(f"cache/{ebook_name}.json", "w") as cache_file:
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
    epub.write_epub(f"assets/text/{ebook_name}/synced/{ebook_name}.epub", book)
