import whisper
from mutagen.mp4 import MP4


def get_chapters(book_name: str):
    mp4 = MP4(f"assets/audio/{book_name}.mp4")
    return mp4.chapters


def get_word_timestamps(book_name: str):
    model = whisper.load_model("base.en")
    result = model.transcribe("assets/audio/tress.mp4", word_timestamps=True)
    return result
