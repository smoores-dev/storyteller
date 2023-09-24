import json
import os
import shlex
import subprocess
from zipfile import ZipFile
import transformers.models.wav2vec2
import whisperx
import whisperx.asr
import whisperx.types

from dataclasses import dataclass
from mutagen.mp4 import MP4, Chapter, MP4Cover
from pathlib import Path, PurePath
from typing import Callable, List, Union, cast

from .files import AUDIO_DIR
from .epub import get_chapters, get_chapter_text, read_epub
from .prompt import generate_initial_prompt


def get_audio_directory(book_name: str):
    return f"{AUDIO_DIR}/{book_name}/"


def get_audio_filepath(book_name: str, filetype: str):
    return f"{get_audio_directory(book_name)}/original/{book_name}.{filetype}"


def get_mp4(book_name: str, filetype: str):
    return MP4(get_audio_filepath(book_name, filetype))


def get_audio_cover_image(book_name: str, filetype: str):
    if filetype == "mp4":
        mp4 = get_mp4(book_name, filetype)
        tags = mp4.tags
        if tags is None:
            return None

        covers = cast(list[MP4Cover], tags.get("covr"))

        if len(covers) == 0:
            return None

        cover = covers[0]

        return cover, "jpg" if cover.imageformat == MP4Cover.FORMAT_JPEG else "png"

    return None


@dataclass
class ChapterRange:
    chapter: Chapter
    start: Union[int, float]
    end: Union[int, float]


def get_chapters_path(book_dir: str):
    return PurePath(book_dir, "chapters")


def get_transcriptions_path(book_dir: str):
    return PurePath(book_dir, "transcriptions")


def get_chapter_filename(
    chapters_dir: Path, book_name: str, chapter_title: str, ext: str
):
    return f"{chapters_dir}/{book_name}-{chapter_title}.{ext}"


def split_audiobook(
    book_name: str, filetype: str, on_progress: Callable[[float], None] | None = None
) -> List[str]:
    book_dir = get_audio_directory(book_name)

    if filetype == "zip":
        with ZipFile(get_audio_filepath(book_name, filetype)) as zf:
            filepaths = [f.filename for f in zf.filelist]
            zf.extractall(get_chapters_path(book_dir))
        return filepaths

    mp4 = get_mp4(book_name, filetype)
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

    chapters_path = get_chapters_path(book_dir)

    Path(chapters_path).mkdir(parents=True, exist_ok=True)

    chapter_filenames: List[str] = []
    for i, range in enumerate(chapter_ranges):
        chapter_filename = get_chapter_filename(
            Path(chapters_path), book_name, range.chapter.title, filetype
        )
        if os.path.exists(chapter_filename):
            os.remove(chapter_filename)

        print(f"Splitting chapter {chapter_filename}")
        chapter_filenames.append(chapter_filename)

        command = shlex.split(
            f'ffmpeg -nostdin -ss {range.start} -to {range.end} -i "{mp4.filename}" -c copy -map 0 -map_chapters -1 "{chapter_filename}"'
        )
        # devnull = open(os.devnull, "w")
        # subprocess.run(command, stdout=devnull, stderr=devnull).check_returncode()
        subprocess.run(command).check_returncode()
        if on_progress is not None:
            on_progress((i + 1) / len(chapter_ranges))

    return chapter_filenames


def get_transcription_filename(chapter_filename: str):
    chapter_path, chapter_basename = os.path.split(chapter_filename)
    chapter_name, _ = os.path.splitext(chapter_basename)
    return PurePath(chapter_path, "..", "transcriptions", f"{chapter_name}.json")


def transcribe_chapter(
    filename: str,
    transcribe_model: whisperx.asr.FasterWhisperPipeline,
    align_model: transformers.models.wav2vec2.Wav2Vec2ForCTC,
    align_metadata: dict,
):
    print(f"Transcribing audio file {filename}")
    transcription_filename = get_transcription_filename(filename)

    if os.path.exists(transcription_filename):
        print("Found existing transcription")
        with open(transcription_filename, mode="r") as transcription_file:
            transcription = json.load(transcription_file)
            return cast(whisperx.types.AlignedTranscriptionResult, transcription)

    print("Loading audio")
    audio = whisperx.load_audio(filename)

    print("Transcribing audio")
    unaligned = transcribe_model.transcribe(audio, batch_size=16)

    print("Aligning transcription")
    transcription = whisperx.align(
        unaligned["segments"],  # type: ignore
        align_model,
        align_metadata,
        audio,
        device="cpu",
        return_char_alignments=False,
    )

    with open(transcription_filename, mode="w") as transcription_file:
        json.dump(transcription, transcription_file)

    return transcription


def get_audio_chapter_filenames(book_name: str):
    book_dir = get_audio_directory(book_name)
    dirname = get_chapters_path(book_dir)
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


def transcribe_book(
    audio_book_name: str,
    epub_book_name: str,
    on_progress: Callable[[float], None] | None = None,
):
    book_dir = get_audio_directory(audio_book_name)
    transcriptions_path = get_transcriptions_path(book_dir)
    Path(transcriptions_path).mkdir(parents=True, exist_ok=True)
    audio_chapter_filenames = get_audio_chapter_filenames(audio_book_name)
    full_book_text = " ".join(
        [
            get_chapter_text(chapter)
            for chapter in get_chapters(read_epub(epub_book_name))
        ]
    )

    initial_prompt = generate_initial_prompt(full_book_text)

    model = whisperx.load_model(
        "base.en",
        device="cpu",
        compute_type="int8",
        asr_options={
            "word_timestamps": True,
            "initial_prompt": initial_prompt,
        },
    )

    align_model, metadata = whisperx.load_align_model(language_code="en", device="cpu")

    for i, f in enumerate(audio_chapter_filenames):
        transcribe_chapter(f, model, align_model, metadata)
        if on_progress is not None:
            on_progress((i + 1) / len(audio_chapter_filenames))
