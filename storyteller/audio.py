from dataclasses import dataclass
from functools import cache
import json
import math
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
    return "\uc3a9".join([segment["text"] for segment in transcription["segments"]])


def find_timestamps(match: Match, transcription):
    s = 0
    position = 0
    while True:
        while position + len(transcription["segments"][s]["text"]) < match.start:  # type: ignore
            position += len(transcription["segments"][s]["text"]) + 1  # type: ignore
            s += 1

        w = 0
        segment = transcription["segments"][s]
        while (
            w < len(segment["words"])
            and position + len(segment["words"][w]["word"]) <= match.start
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


def clean_up_sentence_ranges(
    ranges: List[SentenceRange], duration: float, num_sentences: int
) -> List[SentenceRange]:
    sorted_ranges = sorted(ranges, key=lambda r: r.start)

    runs: List[List[SentenceRange]] = [[]]
    for sentence_range in sorted_ranges:
        if len(runs[-1]) == 0:
            runs[-1].append(sentence_range)
            continue

        if 0 < sentence_range.id - runs[-1][-1].id <= 2:
            runs[-1].append(sentence_range)
            continue

        runs.extend([[sentence_range], []])

    valid_ranges = [
        sentence_range
        for run in runs
        if len(run) > 1
        for sentence_range in run
        if sentence_range.id != 0
    ]

    final_ranges: List[Union[SentenceRange, None]] = [None] * num_sentences

    for sentence_range in valid_ranges:
        final_ranges[sentence_range.id] = sentence_range

    final_ranges[0] = SentenceRange(0, 0, 0)

    for current_range in valid_ranges:
        index = current_range.id
        next_range_index = index + 1
        while (
            next_range_index < len(final_ranges)
            and final_ranges[next_range_index] is None
        ):
            next_range_index += 1

        next_range: SentenceRange = (
            final_ranges[next_range_index]
            if next_range_index < len(final_ranges)
            else SentenceRange(duration, duration, next_range_index)
        )  # type: ignore

        gap = next_range.id - current_range.id
        start_diff = next_range.start - current_range.start
        for i in range(1, gap):
            start = current_range.start + start_diff * i / gap
            final_ranges[index + i] = SentenceRange(start, start, current_range.id + i)

        current_range.end = (
            final_ranges[index + 1].start if index + 1 < len(final_ranges) else duration   # type: ignore
        )
        index += 1

    return cast(List[SentenceRange], final_ranges)


def get_chapter_timestamps(
    transcription: whisperx.types.AlignedTranscriptionResult,
    sentences: List[str],
    duration: float,
):
    sentence_ranges: List[SentenceRange] = []
    transcription_text = get_transcription_text(transcription).lower()
    for index, sentence in enumerate(sentences):
        matches = find_near_matches(
            sentence.strip().lower(),
            transcription_text,
            max_l_dist=math.floor(0.25 * len(sentence)),
        )
        matches = cast(List[Match], matches)
        if len(matches) == 0:
            continue
        first_match = matches[0]
        if first_match.matched.startswith("\uc3a9"):
            first_match = Match(
                first_match.start + 1, first_match.end, first_match.dist, matched=first_match.matched[1:]  # type: ignore
            )
        start = find_timestamps(first_match, transcription)
        sentence_ranges.append(SentenceRange(start, start, index))

    cleaned_sentence_ranges = clean_up_sentence_ranges(sentence_ranges, duration, len(sentences))

    return cleaned_sentence_ranges
