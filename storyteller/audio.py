import os
import subprocess
import shlex
from speech_recognition import Recognizer, AudioFile

def split_audio_file(book_name: str):
    print(f'splitting audio file for {book_name}')
    audio_filepath = f'assets/audio/raw/{book_name}.wav'
    command = shlex.split(f"ffmpeg -i {audio_filepath} -f segment -segment_time 60 -c copy assets/audio/processed/{book_name}/section%09d.wav")
    subprocess.run(command)
    sections = os.listdir(f'assets/audio/processed/{book_name}/')
    return len(sections)


def search_for_keyphrase(book_name: str, section: int, keyphrase: str):
    print(f'searching for phrase "{keyphrase}" in section {section} of {book_name}')
    audio_filepath = f'assets/audio/processed/{book_name}/section{str(section).zfill(9)}.wav'
    recognizer = Recognizer()

    audio_file = AudioFile(audio_filepath)
    with audio_file as source:
        audio = recognizer.record(source)

    decoder = recognizer.recognize_sphinx(
        audio_data=audio, keyword_entries=[(keyphrase, 1)], show_all=True
    )
    for segment in decoder.seg():
        return (segment.start_frame, segment.end_frame, segment.word)
