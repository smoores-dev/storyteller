import json
import os
import shlex
import shutil
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import transformers.models.wav2vec2
import whisperx
import whisperx.asr
import whisperx.types
import urllib.parse

from dataclasses import asdict, dataclass
from mutagen.mp4 import MP4, Chapter, MP4Cover
from mutagen.mp3 import MP3
from pathlib import Path
from typing import Callable, List, Union, cast

from .files import AUDIO_DIR, IMAGE_DIR, StrPath
from .epub import get_chapters, get_chapter_text, read_epub
from .prompt import generate_initial_prompt


def get_audio_directory(book_uuid: str):
    return Path(AUDIO_DIR, str(book_uuid))


def get_audio_index_path(book_uuid: str):
    return get_audio_directory(book_uuid).joinpath("index.json")


def get_audio_index(book_uuid: str):
    with get_audio_index_path(book_uuid).open() as index_file:
        return json.load(index_file)


def get_original_audio_filepath(book_uuid: str, filename: str = ""):
    return get_audio_directory(book_uuid).joinpath("original", filename)


def get_processed_audio_filepath(book_uuid: str, filename: str = ""):
    return get_audio_directory(book_uuid).joinpath("processed", filename)


def get_audio_cover_filepath(book_uuid: str):
    try:
        index = get_audio_index(book_uuid)
    except:
        return None

    if "cover" not in index:
        return None

    return get_audio_directory(book_uuid).joinpath(index["cover"])


def get_processed_files(book_uuid: str):
    index = get_audio_index(book_uuid)
    return sorted(
        [AudioFile(**file_info) for file_info in index["processed_files"]],
        key=lambda a: a.filename,
    )


@dataclass
class ChapterRange:
    chapter: Chapter
    start: Union[int, float]
    end: Union[int, float]


def get_transcriptions_path(book_uuid: str):
    return get_audio_directory(book_uuid).joinpath("transcriptions")


def get_chapter_filename(chapter_index: int, chapter_title: str, ext: str):
    # Most file systems have a max filename length of 255 characters. We leave five
    # characters for the extension (the dot + three or four characters for the
    # actual extension), and then two more because... ???
    filename = urllib.parse.quote_plus(f"{chapter_index + 1:05d}-{chapter_title}")[
        0:248
    ]
    return f"{filename}{ext}"


COVER_IMAGE_FILE_EXTENSIONS = [".jpeg", ".jpg", ".png"]
PLAIN_AUDIO_FILE_EXTENSIONS = [".mp3"]
MPEG4_FILE_EXTENSIONS = [".mp4", ".m4a", ".m4b"]


@dataclass
class AudioFile:
    filename: str
    bare_filename: str
    extension: str


def extract_mpeg4_cover(book_uuid: str, mp4: MP4):
    tags = mp4.tags
    if tags is None:
        return

    covers = cast(list[MP4Cover], tags.get("covr"))

    if len(covers) == 0:
        return

    (cover,) = covers

    suffix = ".jpg" if cover.imageformat == MP4Cover.FORMAT_JPEG else ".png"

    cover_filename = f"Audio Cover{suffix}"
    cover_filepath = get_audio_directory(book_uuid).joinpath(cover_filename)
    cover_filepath.write_bytes(cover)
    persist_cover(book_uuid, cover_filename)


def extract_mp3_cover(book_uuid: str, mp3: MP3):
    # TODO: Figure out how to implement this
    pass


def process_file(
    book_uuid: str,
    filepath: Path,
    out_dir: StrPath,
    on_progress: Callable[[float], None] | None = None,
):
    audio_files: list[AudioFile] = []

    filename = filepath.name
    path = Path(filename)
    bare_filename = path.stem
    ext = path.suffix

    if ext in COVER_IMAGE_FILE_EXTENSIONS and path.stem.lower() == "cover":
        cover_filepath = get_audio_directory(book_uuid).joinpath(filename)
        shutil.copy(filepath, cover_filepath)
        persist_cover(book_uuid, filename)

    if ext in PLAIN_AUDIO_FILE_EXTENSIONS:
        if get_audio_cover_filepath(book_uuid) is None:
            mp3 = MP3(filepath)
            extract_mp3_cover(book_uuid, mp3)
        audio_files.append(
            AudioFile(
                filename=filename,
                bare_filename=bare_filename,
                extension=ext,
            )
        )
        shutil.copy(filepath, out_dir)

    if ext in MPEG4_FILE_EXTENSIONS:
        mp4 = MP4(filepath)
        if get_audio_cover_filepath(book_uuid) is None:
            extract_mpeg4_cover(book_uuid, mp4)
        audio_files.extend(process_mpeg4_file(mp4, out_dir, on_progress))

    if ext == ".zip":
        with ZipFile(filepath) as zf, TemporaryDirectory() as tmp:
            for i, zinfo in enumerate(zf.filelist):
                if zinfo.is_dir():
                    continue
                zext = Path(zinfo.filename).suffix
                if zext in PLAIN_AUDIO_FILE_EXTENSIONS or zext in MPEG4_FILE_EXTENSIONS:

                    def on_intermediate_progress(progress: float):
                        if on_progress is None:
                            return
                        step_size = 1 / len(zf.filelist)
                        on_progress(i / len(zf.filelist) + progress * step_size)

                    tmp_filepath = zf.extract(zinfo, tmp)
                    audio_files.extend(
                        process_file(
                            book_uuid,
                            Path(tmp_filepath),
                            out_dir,
                            on_intermediate_progress,
                        )
                    )

    return audio_files


def process_mpeg4_file(
    mp4: MP4, out_dir: StrPath, on_progress: Callable[[float], None] | None = None
):
    if mp4.chapters is None:
        if mp4.filename is None:
            return cast(list[AudioFile], [])

        print(f"Found no chapters; copying MPEG-4 file as is.")
        shutil.copy(mp4.filename, out_dir)
        path = Path(mp4.filename)
        return [
            AudioFile(
                filename=path.name, bare_filename=path.stem, extension=path.suffix
            )
        ]

    chapters: List[Chapter] = list(mp4.chapters)
    print(f"Found {len(chapters)} chapters")
    chapter_ranges: List[ChapterRange] = []
    for i, chapter in enumerate(chapters):
        next_chapter_start = (
            chapters[i + 1].start if i + 1 < len(chapters) else mp4.info.length
        )
        chapter_ranges.append(ChapterRange(chapter, chapter.start, next_chapter_start))

    audio_files: list[AudioFile] = []
    for i, range in enumerate(chapter_ranges):
        chapter_filename = get_chapter_filename(i, range.chapter.title, ".mp4")

        chapter_filepath = Path(out_dir, chapter_filename)

        if chapter_filepath.exists():
            os.remove(chapter_filepath)

        print(f"Splitting chapter {chapter_filepath}")
        audio_files.append(
            AudioFile(
                filename=chapter_filename,
                bare_filename=chapter_filename[:-4],
                extension=".mp4",
            )
        )

        command = shlex.split(
            f'ffmpeg -nostdin -ss {range.start} -to {range.end} -i "{mp4.filename}" -c copy -map 0 -map_chapters -1 "{chapter_filepath}"'
        )
        # devnull = open(os.devnull, "w")
        # subprocess.run(command, stdout=devnull, stderr=devnull).check_returncode()
        subprocess.run(command).check_returncode()
        if on_progress is not None:
            on_progress((i + 1) / len(chapter_ranges))

    return audio_files


def persist_processed_files_list(book_uuid: str, audio_files: list[AudioFile]):
    try:
        index = get_audio_index(book_uuid)
    except:
        index = {"processed_files": []}
    index["processed_files"] = [asdict(f) for f in audio_files]

    with open(get_audio_index_path(book_uuid), "w") as f:
        json.dump(index, f)


def persist_cover(book_uuid: str, cover_filename: str):
    try:
        index = get_audio_index(book_uuid)
    except:
        index = {}
    index["cover"] = cover_filename

    with open(get_audio_index_path(book_uuid), "w") as f:
        json.dump(index, f)


def process_audiobook(
    book_uuid: str, on_progress: Callable[[float], None] | None = None
) -> List[AudioFile]:
    original_audio_directory = get_original_audio_filepath(book_uuid)
    processed_audio_directory = get_processed_audio_filepath(book_uuid)
    processed_audio_directory.mkdir(parents=True, exist_ok=True)

    filenames = os.listdir(original_audio_directory)

    audio_files: list[AudioFile] = []
    for i, filename in enumerate(filenames):

        def on_intermediate_progress(progress: float):
            if on_progress is None:
                return
            step_size = 1 / len(filenames)
            on_progress(i / len(filenames) + progress * step_size)

        filepath = get_original_audio_filepath(book_uuid, filename)
        audio_files.extend(
            process_file(
                book_uuid, filepath, processed_audio_directory, on_intermediate_progress
            )
        )

    persist_processed_files_list(book_uuid, audio_files)
    return audio_files


def get_transcription_filepath(book_uuid: str, bare_filename: str | None):
    return Path(
        get_audio_directory(book_uuid),
        "transcriptions",
        "" if bare_filename is None else f"{bare_filename}.json",
    )


def transcribe_chapter(
    book_uuid: str,
    filepath: StrPath,
    transcription_name: str,
    device: str,
    transcribe_model: whisperx.asr.FasterWhisperPipeline,
    align_model: transformers.models.wav2vec2.Wav2Vec2ForCTC,
    align_metadata: dict,
    batch_size: int,
):
    print(f"Transcribing audio file {filepath}")
    transcription_filepath = get_transcription_filepath(book_uuid, transcription_name)

    if transcription_filepath.exists():
        print("Found existing transcription")
        with open(transcription_filepath, mode="r") as transcription_file:
            transcription = json.load(transcription_file)
            return cast(whisperx.types.AlignedTranscriptionResult, transcription)

    print("Loading audio")
    audio = whisperx.load_audio(str(filepath))

    print("Transcribing audio")
    unaligned = transcribe_model.transcribe(audio, batch_size=batch_size)

    print("Aligning transcription")
    transcription = whisperx.align(
        unaligned["segments"],  # type: ignore
        align_model,
        align_metadata,
        audio,
        device=device,
        return_char_alignments=False,
    )

    with open(transcription_filepath, mode="w") as transcription_file:
        json.dump(transcription, transcription_file)

    return transcription


def get_transcriptions(book_uuid: str):
    audio_files = get_processed_files(book_uuid)
    transcription_filenames = [
        get_transcription_filepath(book_uuid, audio_file.bare_filename)
        for audio_file in audio_files
    ]
    transcriptions: List[whisperx.types.AlignedTranscriptionResult] = []

    for transcription_filename in transcription_filenames:
        with open(transcription_filename, mode="r") as transcription_file:
            transcription = json.load(transcription_file)
            transcriptions.append(transcription)

    return transcriptions


def transcribe_book(
    book_uuid: str,
    device: str = "cpu",
    batch_size: int = 16,
    compute_type: str = "int8",
    on_progress: Callable[[float], None] | None = None,
):
    transcriptions_path = get_transcriptions_path(book_uuid)
    transcriptions_path.mkdir(parents=True, exist_ok=True)
    audio_files = get_processed_files(book_uuid)
    full_book_text = " ".join(
        [get_chapter_text(chapter) for chapter in get_chapters(read_epub(book_uuid))]
    )

    initial_prompt = generate_initial_prompt(full_book_text)

    model = whisperx.load_model(
        "base.en",
        device=device,
        compute_type=compute_type,
        asr_options={
            "word_timestamps": True,
            "initial_prompt": initial_prompt,
        },
    )

    align_model, metadata = whisperx.load_align_model(language_code="en", device=device)

    for i, audio_file in enumerate(audio_files):
        filepath = get_processed_audio_filepath(book_uuid, audio_file.filename)
        transcribe_chapter(
            book_uuid,
            filepath,
            audio_file.bare_filename,
            device,
            model,
            align_model,
            metadata,
            batch_size,
        )
        if on_progress is not None:
            on_progress((i + 1) / len(audio_files))
