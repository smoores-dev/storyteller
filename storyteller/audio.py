from dataclasses import dataclass
from functools import cache
import json
import math
import re
import shlex
import subprocess
from typing import Callable, List, Union, cast
import whisperx
import whisperx.types
import whisperx.asr
import os
from mutagen.mp4 import MP4, Chapter
from pathlib import PurePath
from fuzzysearch import Match, find_near_matches
from nltk.tokenize import sent_tokenize

from storyteller.prompt import generate_initial_prompt


def get_mp4(book_name: str):
    return MP4(f"assets/audio/{book_name}/original/{book_name}.mp4")


@dataclass
class ChapterRange:
    chapter: Chapter
    start: int | float
    end: int | float


def get_chapter_filename(book_filename: str, chapter_title: str):
    path, basename = os.path.split(book_filename)
    filename, ext = os.path.splitext(basename)
    chapters_path = PurePath(path, "..", "chapters")
    return f"{chapters_path}/{filename}-{chapter_title}{ext}"


def split_audiobook(book_name: str) -> List[str]:
    mp4 = get_mp4(book_name)
    filename = cast(str, mp4.filename)
    if mp4.chapters is None:
        return []

    chapters: List[Chapter] = list(mp4.chapters)
    chapter_ranges: List[ChapterRange] = []
    for i, chapter in enumerate(chapters):
        next_chapter_start = (
            chapters[i + 1].start if i + 1 < len(chapters) else mp4.info.length
        )
        chapter_ranges.append(ChapterRange(chapter, chapter.start, next_chapter_start))

    chapter_filenames: List[str] = []
    for range in chapter_ranges:
        chapter_filename = get_chapter_filename(filename, range.chapter.title)
        chapter_filenames.append(chapter_filename)
        command = shlex.split(
            f'ffmpeg -nostdin -ss {range.start} -to {range.end} -i "{mp4.filename}" -c copy -map 0 -map_chapters -1 "{chapter_filename}"'
        )
        devnull = open(os.devnull, "w")
        subprocess.run(command, stdout=devnull, stderr=devnull)

    return chapter_filenames


def transcribe_chapter(filename: str):
    chapter_path, chapter_basename = os.path.split(filename)
    chapter_name, _ = os.path.splitext(chapter_basename)
    transcription_filename = PurePath(
        chapter_path, "..", "transcriptions", f"{chapter_name}.json"
    )

    if os.path.exists(transcription_filename):
        with open(transcription_filename, mode="r") as transcription_file:
            transcription = json.load(transcription_file)
            return cast(whisperx.types.AlignedTranscriptionResult, transcription)

    # initial_prompt = generate_initial_prompt(chapter_text)
    model = whisperx.load_model(
        "base.en",
        device="cpu",
        compute_type="int8",
        asr_options={"word_timestamps": True},
        # asr_options={"word_timestamps": True, "initial_prompt": initial_prompt},
    )

    audio = whisperx.load_audio(filename)

    unaligned = model.transcribe(audio, batch_size=16)

    alignment_model, metadata = whisperx.load_align_model(
        language_code=unaligned["language"], device="cpu"
    )
    transcription = whisperx.align(
        unaligned["segments"],  # type: ignore
        alignment_model,
        metadata,
        audio,
        device="cpu",
        return_char_alignments=False,
    )

    with open(transcription_filename, mode="w") as transcription_file:
        json.dump(transcription, transcription_file)

    return transcription


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


@dataclass
class SentenceRange:
    start: float
    end: float
    id: int


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
        start = find_timestamps(first_match.start + transcription_offset + 1, transcription)

        if len(sentence_ranges) > 0:
            sentence_ranges[-1].end = start

        sentence_ranges.append(SentenceRange(start, start, sentence_index))
        sentence_index += 1

    if len(sentence_ranges) > 0:
        sentence_ranges[0].start = 0
        sentence_ranges[-1].end = duration

    return sentence_ranges
