from dataclasses import dataclass
from itertools import groupby
import json
import math
from pathlib import Path
from typing import Any, Callable, Dict, List, TypedDict, Union, cast
from fuzzysearch import Match, find_near_matches
from ebooklib import epub
from mutagen.mp4 import MP4
from mutagen.mp3 import MP3
import os
import sys
import whisperx.types

from .files import CACHE_DIR, TEXT_DIR

from .audio import (
    get_audio_chapter_filenames,
    get_transcriptions,
)
from .epub import (
    SentenceRange,
    create_media_overlay,
    get_chapter_sentences,
    get_chapter_text,
    get_epub_audio_filename,
    get_sentences_with_offsets,
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


OFFSET_SEARCH_WINDOW_SIZE = 5000


def find_best_offset(
    epub_sentences: list[str], transcription_text: str, last_match_offset: int
):
    i = 0
    while i < len(transcription_text):
        start_sentence = 0

        start_index = (last_match_offset + i) % len(transcription_text)
        end_index = (start_index + OFFSET_SEARCH_WINDOW_SIZE) % len(transcription_text)
        if end_index > start_index:
            transcription_text_slice = transcription_text[start_index:end_index]
        else:
            transcription_text_slice = (
                transcription_text[start_index:] + transcription_text[:end_index]
            )

        while start_sentence < len(epub_sentences):
            query_string = " ".join(epub_sentences[start_sentence : start_sentence + 6])

            with NullIO():
                matches = find_near_matches(
                    query_string.lower(),
                    transcription_text_slice.lower(),
                    max_l_dist=math.floor(0.1 * len(query_string)),
                )

            matches = cast(List[Match], matches)
            if len(matches) > 0:
                return (start_sentence, matches[0].start + start_index)

            start_sentence += 3

        i += OFFSET_SEARCH_WINDOW_SIZE // 2

    return (0, None)


class StorytellerTranscriptionSegment(whisperx.types.SingleAlignedSegment):
    audiofile: str


class StorytellerTranscription(TypedDict):
    segments: List[StorytellerTranscriptionSegment]
    word_segments: List[whisperx.types.SingleWordSegment]


def concat_transcriptions(
    transcriptions: List[whisperx.types.AlignedTranscriptionResult],
    audiofiles: List[str],
):
    result = StorytellerTranscription(segments=[], word_segments=[])
    for transcription, audiofile in zip(transcriptions, audiofiles):
        result["word_segments"].extend(transcription["word_segments"])
        result["segments"].extend(
            [
                StorytellerTranscriptionSegment(**segment, audiofile=audiofile)
                for segment in transcription["segments"]
            ]
        )
    return result


def get_transcription_text(transcription: StorytellerTranscription):
    return " ".join([segment["text"] for segment in transcription["segments"]])


def find_timestamps(match_start_index: int, transcription: StorytellerTranscription):
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
        return start_word["start"], segment["audiofile"]

    return segment["start"], segment["audiofile"]


def get_window_index_from_offset(window: List[str], offset: int):
    index = 0
    while offset >= len(window[index]):
        offset -= len(window[index])
        index += 1
    return index


def get_sentence_ranges(
    start_sentence: int,
    transcription: StorytellerTranscription,
    sentences: List[str],
    chapter_offset: int,
    last_sentence_range: Union[SentenceRange, None],
):
    sentence_ranges: List[SentenceRange] = []
    transcription_text = get_transcription_text(transcription).lower()[chapter_offset:]
    transcription_sentences = get_sentences_with_offsets(transcription_text)
    transcription_window_index = 0
    last_good_transcription_window = 0
    not_found = 0

    sentence_index = start_sentence
    while sentence_index < len(sentences):
        sentence = sentences[sentence_index]
        transcription_window_list = transcription_sentences[
            transcription_window_index : transcription_window_index + 10
        ]
        transcription_window = "".join(transcription_window_list)

        matches = find_near_matches(
            sentence.strip().lower(),
            transcription_window,
            max_l_dist=math.floor(0.25 * len(sentence)),
        )
        matches = cast(List[Match], matches)

        if len(matches) == 0:
            sentence_index += 1
            not_found += 1
            if not_found == 3 or sentence_index == len(sentences) - 1:
                transcription_window_index += 1
                if transcription_window_index == last_good_transcription_window + 30:
                    transcription_window_index = last_good_transcription_window
                    not_found = 0
                    continue
                sentence_index -= not_found
                not_found = 0
            continue

        first_match = matches[0]

        transcription_offset = (
            len("".join(transcription_sentences[:transcription_window_index])) + 1
        )
        start, audiofile = find_timestamps(
            first_match.start + transcription_offset + chapter_offset, transcription
        )

        if len(sentence_ranges) > 0:
            last_audiofile = sentence_ranges[-1].audiofile
            if audiofile == last_audiofile:
                sentence_ranges[-1].end = start
            else:
                last_mp4 = (
                    MP4(last_audiofile)
                    if last_audiofile.endswith(".mp4")
                    else MP3(last_audiofile)
                )
                sentence_ranges[-1].end = last_mp4.info.length
                start = 0
        elif last_sentence_range is not None:
            if audiofile == last_sentence_range.audiofile:
                last_sentence_range.end = start
            else:
                last_mp4 = (
                    MP4(last_sentence_range.audiofile)
                    if last_sentence_range.audiofile.endswith(".mp4")
                    else MP3(last_sentence_range.audiofile)
                )
                last_sentence_range.end = last_mp4.info.length
                start = 0
        else:
            start = 0

        sentence_ranges.append(SentenceRange(sentence_index, start, start, audiofile))

        not_found = 0
        transcription_window_index = (
            get_window_index_from_offset(transcription_window_list, first_match.start)
            + transcription_window_index
        )

        last_good_transcription_window = transcription_window_index
        sentence_index += 1

    return sentence_ranges


def interpolate_sentence_ranges(
    sentence_ranges: List[SentenceRange],
) -> List[SentenceRange]:
    interpolated: List[SentenceRange] = []
    for sentence_range in sentence_ranges:
        if len(interpolated) == 0:
            interpolated.append(sentence_range)
            continue

        last_sentence_range = interpolated[-1]

        count = sentence_range.id - last_sentence_range.id
        diff = last_sentence_range.end - last_sentence_range.start
        interpolated_length = diff / count

        for i in range(1, count):
            interpolated_sentence_range = SentenceRange(
                last_sentence_range.id + i,
                last_sentence_range.start + interpolated_length * i,
                last_sentence_range.start + interpolated_length * (i + 1),
                last_sentence_range.audiofile,
            )
            interpolated.append(interpolated_sentence_range)

        interpolated.append(sentence_range)

    return interpolated


def get_chapter_duration(sentence_ranges: List[SentenceRange]):
    duration = 0
    for _, file_group in groupby(sentence_ranges, key=lambda r: r.audiofile):
        file_group_list = list(file_group)
        duration += file_group_list[-1].end - file_group_list[0].start
    return duration


@dataclass
class SyncedChapter:
    chapter: epub.EpubHtml
    sentence_ranges: List[SentenceRange]
    audio: List[epub.EpubItem]


def sync_chapter(
    start_sentence: int,
    transcription: StorytellerTranscription,
    chapter: epub.EpubHtml,
    transcription_offset: int,
    last_sentence_range: Union[SentenceRange, None],
):
    chapter_sentences = get_chapter_sentences(chapter)
    sentence_ranges = get_sentence_ranges(
        start_sentence,
        transcription,
        chapter_sentences,
        transcription_offset,
        last_sentence_range,
    )
    sentence_ranges = interpolate_sentence_ranges(sentence_ranges)
    tag_sentences(chapter)

    chapter_filepath_length = len(chapter.file_name.split(os.path.sep)) - 1
    relative_ups = "../" * chapter_filepath_length
    chapter.add_link(
        rel="stylesheet",
        href=f"{relative_ups}Styles/storyteller-readaloud.css",
        type="text/css",
    )

    audiofiles = set([sentence_range.audiofile for sentence_range in sentence_ranges])
    audio_items = []
    for audiofile in audiofiles:
        epub_audio_filename = get_epub_audio_filename(audiofile)
        audio_item = epub.EpubItem(
            uid=epub_audio_filename,
            file_name=epub_audio_filename,
            content=open(audiofile, "rb").read(),  # type: ignore
            media_type="audio/mpeg",
        )
        audio_items.append(audio_item)

    return SyncedChapter(
        chapter=chapter,
        sentence_ranges=sentence_ranges,
        audio=audio_items,
    )


def format_duration(duration: float):
    hours = math.floor(duration / 3600)
    minutes = math.floor(duration / 60 - hours * 60)
    seconds = duration - minutes * 60 - hours * 3600
    return f"{str(hours).zfill(2)}:{str(minutes).zfill(2)}:{round(seconds, 3)}"


def update_synced_chapter(book: epub.EpubBook, synced: SyncedChapter):
    base_filename, _ = os.path.splitext(os.path.basename(synced.chapter.file_name))

    media_overlay_item = epub.EpubSMIL(
        uid=f"{base_filename}_overlay",
        file_name=f"MediaOverlays/{base_filename}.smil",
        content=create_media_overlay(
            base_filename, synced.chapter.file_name, synced.sentence_ranges
        ),
    )
    synced.chapter.media_overlay = media_overlay_item.id

    duration = get_chapter_duration(synced.sentence_ranges)

    book.add_metadata(
        None,
        "meta",
        format_duration(duration),
        {"property": "media:duration", "refines": f"#{media_overlay_item.id}"},
    )

    for audio_item in synced.audio:
        if book.get_item_with_id(audio_item.id) is None:
            book.add_item(audio_item)

    book.add_item(media_overlay_item)

    return duration


def sync_book(
    ebook_name: str,
    audiobook_name: str,
    on_progress: Callable[[float], None] | None = None,
):
    book = read_epub(ebook_name)
    epub_chapters = get_chapters(book)
    print(f"Found {len(epub_chapters)} chapters in the ebook")
    audio_chapter_filenames = get_audio_chapter_filenames(audiobook_name)
    transcriptions = get_transcriptions(audiobook_name)
    transcription = concat_transcriptions(transcriptions, audio_chapter_filenames)
    transcription_text = get_transcription_text(transcription)
    book_cache: Dict[str, Any] = {}
    if os.path.exists(f"{CACHE_DIR}/{ebook_name}.json"):
        with open(f"{CACHE_DIR}/{ebook_name}.json", "r") as cache_file:
            book_cache = json.load(cache_file)
    if "chapter_index" not in book_cache:
        book_cache["chapter_index"] = {}
    total_duration = 0
    last_transcription_offset = 0
    synced_chapters: List[SyncedChapter] = []
    for index, chapter in enumerate(epub_chapters):
        epub_sentences = get_chapter_sentences(chapter)
        epub_intro = " ".join(epub_sentences)[:60].replace("\n", " ")
        print(f"Syncing chapter #{index} ({epub_intro}...)")
        try:
            cached = book_cache["chapter_index"][str(index)]
            start_sentence = 0 if isinstance(cached, int) else cached["start_sentence"]
            transcription_offset = (
                cached if isinstance(cached, int) else cached["transcription_offset"]
            )
            if transcription_offset is None:
                if on_progress is not None:
                    on_progress((index + 1) / len(epub_chapters))
                continue
        except:
            (start_sentence, transcription_offset) = find_best_offset(
                epub_sentences,
                transcription_text,
                last_transcription_offset,
            )
            if transcription_offset is None:
                print(f"Couldn't find matching transcription for chapter #{index}")
                book_cache["chapter_index"][str(index)] = {
                    "start_sentence": 0,
                    "transcription_offset": None,
                }
                with open(f"{CACHE_DIR}/{ebook_name}.json", "w") as cache_file:
                    json.dump(book_cache, cache_file)
                if on_progress is not None:
                    on_progress((index + 1) / len(epub_chapters))
                continue

        print(
            f"Chapter #{index} best matches transcription at offset {transcription_offset}, starting at sentence {start_sentence}"
        )

        book_cache["chapter_index"][str(index)] = {
            "start_sentence": start_sentence,
            "transcription_offset": transcription_offset,
        }
        with open(f"{CACHE_DIR}/{ebook_name}.json", "w") as cache_file:
            json.dump(book_cache, cache_file)

        synced = sync_chapter(
            start_sentence,
            transcription,
            chapter,
            transcription_offset,
            synced_chapters[-1].sentence_ranges[-1]
            if len(synced_chapters) > 0 and len(synced_chapters[-1].sentence_ranges) > 0
            else None,
        )

        synced_chapters.append(synced)
        last_transcription_offset = transcription_offset
        if on_progress is not None:
            on_progress((index + 1) / len(epub_chapters))

    for synced in synced_chapters:
        total_duration += update_synced_chapter(book, synced)

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

    synced_epub_path = Path(f"{TEXT_DIR}/{ebook_name}/synced")
    synced_epub_path.mkdir(parents=True, exist_ok=True)

    epub.write_epub(Path(synced_epub_path, f"{ebook_name}.epub"), book)
    print(f"Synced EPUB written to {synced_epub_path}")
