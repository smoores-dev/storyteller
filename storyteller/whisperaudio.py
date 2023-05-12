from dataclasses import dataclass
import shlex
import subprocess
from typing import Dict, List
import whisper
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


def split_audiobook(book_name: str):
    mp4 = get_mp4(book_name)
    if mp4.chapters is None or mp4.filename is None:
        return

    chapters: List[Chapter] = list(mp4.chapters)
    chapter_ranges: List[ChapterRange] = []
    for i, chapter in enumerate(chapters):
        next_chapter_start = chapters[i + 1].start if i + 1 < len(chapters) else mp4.info.length
        chapter_ranges.append(ChapterRange(chapter, chapter.start, next_chapter_start))
    
    filename, ext = os.path.splitext(mp4.filename)
    for range in chapter_ranges:
        command = shlex.split(f'ffmpeg -nostdin -ss {range.start} -to {range.end} -i "{mp4.filename}" -c copy -map 0 -map_chapters -1 "{filename}-{range.chapter.title}{ext}"')
        subprocess.run(command)


def transcribe_chapters(book_name: str, model: whisper.Whisper, initial_prompt: str):
    mp4 = get_mp4(book_name)
    if mp4.chapters is None:
        return model.transcribe(
            f"assets/audio/{book_name}.mp4",
            verbose=False,
            word_timestamps=True,
            initial_prompt=initial_prompt,
            language="en",
            fp16=False,
        )

    chapters: List[Chapter] = list(mp4.chapters)
    # TODO: temp hack to reduce processing time
    chapters = chapters[0:3]

    return [
        model.transcribe(
            f"assets/audio/{book_name}-{chapter.title}.mp4",
            verbose=False,
            word_timestamps=True,
            initial_prompt=initial_prompt,
            language="en",
            fp16=False,
        )
        for chapter in chapters
    ]


def get_word_timestamps(book_name: str):
    model = whisper.load_model("base.en")
    initial_prompt = generate_initial_prompt(book_name)

    return transcribe_chapters(book_name, model, initial_prompt)
