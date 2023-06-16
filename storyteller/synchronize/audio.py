import json
import os
import shlex
import subprocess
import whisperx
import whisperx.asr
import whisperx.types

from dataclasses import dataclass
from mutagen.mp4 import MP4, Chapter
from pathlib import Path, PurePath
from typing import List, Union, cast

from .files import AUDIO_DIR
from .epub import get_chapters, get_chapter_text, read_epub
from .prompt import generate_initial_prompt


def get_audio_filepath(book_name: str):
    return f"{AUDIO_DIR}/{book_name}/original/{book_name}.mp4"


def get_mp4(book_name: str):
    return MP4(get_audio_filepath(book_name))


@dataclass
class ChapterRange:
    chapter: Chapter
    start: Union[int, float]
    end: Union[int, float]


def get_chapters_path(book_filename: str):
    path, _ = os.path.split(book_filename)
    return PurePath(path, "..", "chapters")


def get_transcriptions_path(book_filename: str):
    path, _ = os.path.split(book_filename)
    return PurePath(path, "..", "transcriptions")


def get_chapter_filename(book_filename: str, chapter_title: str):
    _, basename = os.path.split(book_filename)
    filename, ext = os.path.splitext(basename)
    chapters_path = get_chapters_path(book_filename)
    return f"{chapters_path}/{filename}-{chapter_title}{ext}"


def split_audiobook(book_name: str) -> List[str]:
    mp4 = get_mp4(book_name)
    filename = cast(str, mp4.filename)
    if mp4.chapters is None:
        return []

    print(f"Splitting audiobook chapters for {filename}")

    chapters: List[Chapter] = list(mp4.chapters)
    print(f"Found {len(chapters)} chapters")
    chapter_ranges: List[ChapterRange] = []
    for i, chapter in enumerate(chapters):
        next_chapter_start = (
            chapters[i + 1].start if i + 1 < len(chapters) else mp4.info.length
        )
        chapter_ranges.append(ChapterRange(chapter, chapter.start, next_chapter_start))

    chapters_path = get_chapters_path(filename)

    Path(chapters_path).mkdir(parents=True, exist_ok=True)

    chapter_filenames: List[str] = []
    for range in chapter_ranges:
        chapter_filename = get_chapter_filename(filename, range.chapter.title)
        if os.path.exists(chapter_filename):
            continue
        print(f"Splitting chapter {chapter_filename}")
        chapter_filenames.append(chapter_filename)
        command = shlex.split(
            f'ffmpeg -nostdin -ss {range.start} -to {range.end} -i "{mp4.filename}" -c copy -map 0 -map_chapters -1 "{chapter_filename}"'
        )
        devnull = open(os.devnull, "w")
        subprocess.run(command, stdout=devnull, stderr=devnull).check_returncode()

    return chapter_filenames


def get_transcription_filename(chapter_filename: str):
    chapter_path, chapter_basename = os.path.split(chapter_filename)
    chapter_name, _ = os.path.splitext(chapter_basename)
    return PurePath(chapter_path, "..", "transcriptions", f"{chapter_name}.json")


def transcribe_chapter(filename: str, initial_prompt: str):
    print(f"Transcribing audio file {filename}")
    transcription_filename = get_transcription_filename(filename)

    if os.path.exists(transcription_filename):
        print("Found existing transcription")
        with open(transcription_filename, mode="r") as transcription_file:
            transcription = json.load(transcription_file)
            return cast(whisperx.types.AlignedTranscriptionResult, transcription)

    print("Loading whisperx model")
    model = whisperx.load_model(
        "base.en",
        device="cpu",
        compute_type="int8",
        asr_options={
            "word_timestamps": True,
            "initial_prompt": initial_prompt,
        },
    )

    audio = whisperx.load_audio(filename)

    print("Transcribing audio")
    unaligned = model.transcribe(audio, batch_size=16)

    alignment_model, metadata = whisperx.load_align_model(
        language_code=unaligned["language"], device="cpu"
    )
    print("Aligning transcription")
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


def get_audio_chapter_filenames(book_name: str):
    audio_filepath = get_audio_filepath(book_name)
    dirname = get_chapters_path(audio_filepath)
    return [str(Path(dirname, filename)) for filename in os.listdir(dirname)]


def get_transcriptions(book_name: str):
    audio_chapter_filenames = get_audio_chapter_filenames(book_name)
    transcription_filenames = [
        get_transcription_filename(chapter_filename)
        for chapter_filename in audio_chapter_filenames
    ]
    transcriptions: List[whisperx.types.AlignedTranscriptionResult] = []

    for transcription_filename in transcription_filenames:
        with open(transcription_filename, mode="r") as transcription_file:
            transcription = json.load(transcription_file)
            transcriptions.append(transcription)

    return transcriptions


def transcribe_book(audio_book_name: str, epub_book_name: str):
    audio_filepath = get_audio_filepath(audio_book_name)
    transcriptions_path = get_transcriptions_path(audio_filepath)
    Path(transcriptions_path).mkdir(parents=True, exist_ok=True)
    audio_chapter_filenames = get_audio_chapter_filenames(audio_book_name)
    full_book_text = " ".join(
        [
            get_chapter_text(chapter)
            for chapter in get_chapters(read_epub(epub_book_name))
        ]
    )
    initial_prompt = generate_initial_prompt(full_book_text)
    for f in audio_chapter_filenames:
        transcribe_chapter(f, initial_prompt)
