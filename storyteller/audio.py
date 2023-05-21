from dataclasses import dataclass
import shlex
import subprocess
from typing import List, cast
import whisperx
import whisperx.asr
import os
from mutagen.mp4 import MP4, Chapter

from storyteller.prompt import generate_initial_prompt


def get_mp4(book_name: str):
    return MP4(f"assets/audio/{book_name}.mp4")


@dataclass
class ChapterRange:
    chapter: Chapter
    start: int | float
    end: int | float


def get_chapter_filename(book_filename: str, chapter_title: str):
    filename, ext = os.path.splitext(book_filename)
    return f"{filename}-{chapter_title}{ext}"


def split_audiobook(book_name: str):
    mp4 = get_mp4(book_name)
    filename = cast(str, mp4.filename)
    if mp4.chapters is None:
        return

    chapters: List[Chapter] = list(mp4.chapters)
    chapter_ranges: List[ChapterRange] = []
    for i, chapter in enumerate(chapters):
        next_chapter_start = (
            chapters[i + 1].start if i + 1 < len(chapters) else mp4.info.length
        )
        chapter_ranges.append(ChapterRange(chapter, chapter.start, next_chapter_start))

    for range in chapter_ranges:
        command = shlex.split(
            f'ffmpeg -nostdin -ss {range.start} -to {range.end} -i "{mp4.filename}" -c copy -map 0 -map_chapters -1 "{get_chapter_filename(filename, range.chapter.title)}"'
        )
        subprocess.run(command)


def transcribe_chapter(filename: str, chapter_text: str):
    initial_prompt = generate_initial_prompt(chapter_text)
    model = whisperx.load_model(
        "base.en",
        device="cpu",
        compute_type="int8",
        asr_options={"word_timestamps": True, "initial_prompt": initial_prompt},
    )

    audio = whisperx.load_audio(filename)

    unaligned = model.transcribe(audio, batch_size=16)

    alignment_model, metadata = whisperx.load_align_model(
        language_code=unaligned["language"], device="cpu"
    )
    transcription = whisperx.align(unaligned["segments"], alignment_model, metadata, audio, device="cpu", return_char_alignments=False)  # type: ignore
    return transcription
