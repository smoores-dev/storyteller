from dataclasses import dataclass
import shlex
import subprocess
from typing import Dict, List, cast
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
        next_chapter_start = chapters[i + 1].start if i + 1 < len(chapters) else mp4.info.length
        chapter_ranges.append(ChapterRange(chapter, chapter.start, next_chapter_start))
    
    for range in chapter_ranges:
        command = shlex.split(f'ffmpeg -nostdin -ss {range.start} -to {range.end} -i "{mp4.filename}" -c copy -map 0 -map_chapters -1 "{get_chapter_filename(filename, range.chapter.title)}"')
        subprocess.run(command)


def transcribe_chapter(book_name: str, chapter_title: str, initial_prompt: str):
    mp4 = get_mp4(book_name)
    filename = cast(str, mp4.filename)
    model = whisperx.load_model(
        "base.en",
        device="cpu",
        compute_type="int8",
        asr_options={
            "word_timestamps": True,
            "initial_prompt": initial_prompt
        }
    )

    audio = whisperx.load_audio(get_chapter_filename(filename, chapter_title))
    
    unaligned = model.transcribe(
        audio, batch_size=16
    )

    alignment_model, metadata = whisperx.load_align_model(language_code=unaligned["language"], device="cpu")
    transcription = whisperx.align(unaligned['segments'], alignment_model, metadata, audio, device="cpu", return_char_alignments=False)
    return transcription


def transcribe_chapters(book_name: str, model: whisperx.asr.WhisperModel, initial_prompt: str):
    mp4 = get_mp4(book_name)
    filename = cast(str, mp4.filename)
    if mp4.chapters is None:
        return model.transcribe(
            filename,
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
            get_chapter_filename(filename, chapter.title),
            verbose=False,
            word_timestamps=True,
            initial_prompt=initial_prompt,
            language="en",
            fp16=False,
        )
        for chapter in chapters
    ]


def get_word_timestamps(book_name: str):
    model = whisperx.load_model("base.en")
    initial_prompt = generate_initial_prompt(book_name)

    return transcribe_chapters(book_name, model, initial_prompt)
