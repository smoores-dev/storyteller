from dataclasses import dataclass
from functools import cache
import json
import math
from typing import Any, Dict, List, TypedDict, Union, cast
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
    get_epub_audio_filename,
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


def find_best_offset(epub_text: str, transcription_text: str, last_match_offset: int):
    search_string = epub_text[
        :1000
    ]  # speed up search by only using the first few hundred words
    i = 0
    while i < len(transcription_text):
        start_index = (last_match_offset + (i * 1000)) % len(transcription_text)
        # print(f'Searching at "{transcription_text[start_index:start_index + 500]}"')
        end_index = (start_index + 3000) % len(transcription_text)
        if end_index > start_index:
            transcription_text_slice = transcription_text[start_index:end_index]
        else:
            transcription_text_slice = (
                transcription_text[start_index:] + transcription_text[:end_index]
            )
        with NullIO():
            matches = find_near_matches(
                search_string,
                transcription_text_slice,
                max_l_dist=math.floor(0.10 * len(search_string)),
            )
        matches = cast(List[Match], matches)
        if len(matches) > 0:
            return matches[0].start + start_index

        i += 1
    return None


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


@cache
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


def get_chapter_timestamps(
    transcription: StorytellerTranscription,
    sentences: List[str],
    chapter_offset: int,
    last_sentence_range: Union[SentenceRange, None],
):
    sentence_ranges: List[SentenceRange] = []
    transcription_text = get_transcription_text(transcription).lower()[chapter_offset:]
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

        transcription_offset = (
            len(" ".join(transcription_sentences[:transcription_window_index])) + 1
        )
        start, audiofile = find_timestamps(
            first_match.start + transcription_offset + chapter_offset, transcription
        )

        if len(sentence_ranges) > 0:
            last_audiofile = sentence_ranges[-1].audiofile
            if audiofile == last_audiofile:
                sentence_ranges[-1].end = start
            else:
                last_mp4 = MP4(last_audiofile)
                sentence_ranges[-1].end = last_mp4.info.length
                start = 0
        elif last_sentence_range is not None:
            if audiofile == last_sentence_range.audiofile:
                last_sentence_range.end = start
            else:
                last_mp4 = MP4(last_sentence_range.audiofile)
                last_sentence_range.end = last_mp4.info.length
                start = 0
        else:
            start = 0

        sentence_ranges.append(SentenceRange(sentence_index, start, start, audiofile))
        sentence_index += 1

    return sentence_ranges


@dataclass
class SyncedChapter:
    chapter: epub.EpubHtml
    sentence_ranges: List[SentenceRange]
    audio: List[epub.EpubItem]
    media_overlay: epub.EpubSMIL


def sync_chapter(
    transcription: StorytellerTranscription,
    chapter: epub.EpubHtml,
    transcription_offset: int,
    last_sentence_range: Union[SentenceRange, None],
):
    chapter_sentences = get_chapter_sentences(chapter)
    sentence_ranges = get_chapter_timestamps(
        transcription, chapter_sentences, transcription_offset, last_sentence_range
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

    audiofiles = set([sentence_range.audiofile for sentence_range in sentence_ranges])
    audio_items = []
    for audiofile in audiofiles:
        audio_item = epub.EpubItem(
            uid=f"{base_filename}_audio",
            file_name=get_epub_audio_filename(audiofile),
            content=open(audiofile, "rb").read(),  # type: ignore
            media_type="audio/mpeg",
        )
        audio_items.append(audio_item)

    media_overlay_item = epub.EpubSMIL(
        uid=f"{base_filename}_overlay",
        file_name=f"MediaOverlays/{base_filename}.smil",
        content=create_media_overlay(base_filename, chapter.file_name, sentence_ranges),
    )
    chapter.media_overlay = media_overlay_item.id

    return SyncedChapter(
        chapter=chapter,
        sentence_ranges=sentence_ranges,
        audio=audio_items,
        media_overlay=media_overlay_item,
    )


def format_duration(duration: float):
    hours = math.floor(duration / 3600)
    minutes = math.floor(duration / 60 - hours * 3600)
    seconds = duration - minutes * 60 - hours * 3600
    return f"{str(hours).zfill(2)}:{str(minutes).zfill(2)}:{round(seconds, 3)}"


def update_synced_chapter(book: epub.EpubBook, synced: SyncedChapter):
    # TODO: Figure out how to compute per-chapter durations
    # book.add_metadata(
    #     None,
    #     "meta",
    #     format_duration(synced.duration),
    #     {"property": "media:duration", "refines": f"#{synced.media_overlay.id}"},
    # )

    for audio_item in synced.audio:
        if book.get_item_with_id(audio_item.id) is not None:
            book.add_item(audio_item)

    book.add_item(synced.media_overlay)


def sync_book(ebook_name: str, audiobook_name: str):
    book = read_epub(ebook_name)
    epub_chapters = get_chapters(book)
    print(f"Found {len(epub_chapters)} chapters in the ebook")
    audio_chapter_filenames = get_audio_chapter_filenames(audiobook_name)
    transcriptions = get_transcriptions(audiobook_name)
    transcription = concat_transcriptions(transcriptions, audio_chapter_filenames)
    transcription_text = get_transcription_text(transcription)
    book_cache: Dict[str, Any] = {}
    if os.path.exists(f"cache/{ebook_name}.json"):
        with open(f"cache/{ebook_name}.json", "r") as cache_file:
            book_cache = json.load(cache_file)
    if "chapter_index" not in book_cache:
        book_cache["chapter_index"] = {}
    total_duration = 0
    last_transcription_offset = 0
    last_synced: Union[SyncedChapter, None] = None
    for index, chapter in enumerate(epub_chapters):
        epub_text = get_chapter_text(chapter)
        epub_intro = epub_text[:60].replace("\n", " ")
        print(f"Syncing chapter #{index} ({epub_intro}...)")
        try:
            transcription_offset = book_cache["chapter_index"][str(index)]
            if transcription_offset is None:
                continue
        except:
            transcription_offset = find_best_offset(
                epub_text,
                transcription_text,
                last_transcription_offset,
            )
            if transcription_offset is None:
                print(f"Couldn't find matching transcription for chapter #{index}")
                book_cache["chapter_index"][str(index)] = None
                with open(f"cache/{ebook_name}.json", "w") as cache_file:
                    json.dump(book_cache, cache_file)
                continue

        print(f"Chapter #{index} best matches transcription at #{transcription_offset}")

        book_cache["chapter_index"][str(index)] = transcription_offset
        with open(f"cache/{ebook_name}.json", "w") as cache_file:
            json.dump(book_cache, cache_file)
        # print(f"Syncing with audio file {audio_filename}")
        synced = sync_chapter(
            transcription,
            chapter,
            transcription_offset,
            last_synced.sentence_ranges[-1]
            if last_synced is not None and len(last_synced.sentence_ranges) > 0
            else None,
        )
        update_synced_chapter(book, synced)
        last_transcription_offset = transcription_offset
        # TODO: Figure out how to compute per-chapter durations
        # total_duration += synced.duration
        # print(f"New total duration is {total_duration}s")

    # book.add_metadata(
    #     None, "meta", format_duration(total_duration), {"property": "media:duration"}
    # )
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
