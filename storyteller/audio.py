from speech_recognition import Recognizer, AudioFile
from pydub import AudioSegment

def split_audio_file(audio_filename: str):
    full_audio = AudioSegment.from_wav(f'/workspaces/storyteller/assets/audio/raw/{audio_filename}.wav')
    length = len(full_audio)
    for start_ms in range(0, length, 60000):
        end_ms = start_ms + 60000
        audio_segment = full_audio[start_ms:end_ms]
        audio_segment.export(f'/workspaces/storyteller/assets/audio/processed/{audio_filename}/section{start_ms / 60000}.wav', format="wav")


def search_for_sentence(audio_filepath: str, sentence: str):
    recognizer = Recognizer()

    audio_file = AudioFile(audio_filepath)
    with audio_file as source:
        audio = recognizer.record(source)

    decoder = recognizer.recognize_sphinx(
        audio_data=audio, keyword_entries=[(sentence, 1)], show_all=True
    )
    for segment in decoder.seg():
        return (segment.start_frame, segment.end_frame, segment.word)
