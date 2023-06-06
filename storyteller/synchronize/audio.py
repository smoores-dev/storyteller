from dataclasses import dataclass
import json
import shlex
import subprocess
from typing import List, cast
import whisperx
import whisperx.types
import whisperx.asr
import os
from mutagen.mp4 import MP4, Chapter
from pathlib import PurePath


def get_audio_filepath(book_name: str):
    return f"assets/audio/{book_name}/original/{book_name}.mp4"


def get_mp4(book_name: str):
    return MP4(get_audio_filepath(book_name))


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
