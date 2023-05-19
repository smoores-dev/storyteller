from typing import Tuple
import math
import whisper
import numpy as np
from fuzzysearch import find_near_matches
from nltk.tokenize import word_tokenize
from storyteller.audio import search_for_keyphrase, split_audio_file
from storyteller.epub import get_windowed_keyphrases
from storyteller.text import levenshtein
from storyteller.whisperaudio import get_chapter_filename
from storyteller.prompt import generate_initial_prompt


SAMPLE_RATE = 16000
CHUNK_LENGTH = 30
N_SAMPLES = CHUNK_LENGTH * SAMPLE_RATE  # 480000 samples in a 30-second chunk


def pad_or_trim(array: np.ndarray, start: int = 0):
    axis = -1
    start_index = start * SAMPLE_RATE
    if array.shape[-1] > start_index + N_SAMPLES:
        array = array.take(
            indices=range(start_index, start_index + N_SAMPLES), axis=axis
        )

    if array.shape[-1] < start_index + N_SAMPLES:
        pad_widths = [(0, 0)] * array.ndim
        pad_widths[axis] = (0, start_index + N_SAMPLES - array.shape[axis])  # type: ignore
        array = np.pad(array, pad_widths)

    return array


def get_sentence_timestamps(model: whisper.Whisper, filename: str, sentence: str):
    # initial_prompt = generate_initial_prompt(sentence)
    sentence_tokens = word_tokenize(sentence)
    audio = whisper.load_audio(filename)
    audio_length = len(audio) / SAMPLE_RATE
    seek = 0
    print(f"The following is a section from a fictional story. It contains the sentence: {sentence}")
    while seek <= audio_length:
        # audio_segment = whisper.pad_or_trim(audio, seek)
        audio_segment = whisper.pad_or_trim(audio)
        transcription = model.transcribe(
            audio_segment,
            verbose=True,
            word_timestamps=True,
            initial_prompt=f"The following is a section from a fictional story. It contains the sentence: {sentence}",
            language="en",
            fp16=False,
            condition_on_previous_text=False
        )
        matches = find_near_matches(
            sentence,
            transcription['text'],
            max_l_dist=math.floor(0.2 * len(sentence_tokens))
        )
        
        # print(edlib.getNiceAlignment(alignment, sentence_tokens, transcription_tokens))
        # return sentence_tokens, transcription_tokens, alignment, transcription
        return matches


def interpolate_index(book_name: str):
    with open(
        f"/workspaces/storyteller/indices/{book_name}.txt", "r+"
    ) as index_descriptor:
        contents = index_descriptor.readlines()
        first_line = 0
        second_line = 1
        while second_line < len(contents):
            [first_timestamp, first_sentence] = [
                int(x) for x in contents[first_line].split(":")
            ]
            [second_timestamp, second_sentence] = [
                int(x) for x in contents[second_line].split(":")
            ]
            diff = second_sentence - first_sentence
            interpolated_sentence = first_sentence + 1
            timestamp_increment = math.floor(
                (second_timestamp - first_timestamp) / diff
            )
            interpolated_timestamp = first_timestamp + timestamp_increment
            while interpolated_sentence < second_sentence:
                contents.insert(
                    first_line + interpolated_sentence - first_sentence,
                    f"{interpolated_timestamp}:{interpolated_sentence}\n",
                )
                interpolated_sentence += 1
                interpolated_timestamp += timestamp_increment
            first_line += diff
            second_line = first_line + 1
        index_descriptor.seek(0)
        index_descriptor.writelines(contents)


def index_search_result(
    book_name: str,
    audio_section: int,
    keyphrase: int,
    search_result: Tuple[int, int, str],
):
    print(
        f'found keyphrase "{search_result[2]}" at frame {search_result[0]} in section {audio_section} of {book_name}'
    )
    with open(
        f"/workspaces/storyteller/indices/{book_name}.txt", "a"
    ) as index_descriptor:
        index_descriptor.write(
            f"{audio_section * 60000 + search_result[0]}:{keyphrase}\n"
        )


def build_index(book_name: str):
    num_sections = split_audio_file(book_name)
    keyphrases = get_windowed_keyphrases(book_name)
    current_audio_section = 0
    next_audio_section = 1
    current_keyphrase = 0
    current_window = 0
    first_failed_search = None
    failed_searches = 0
    while next_audio_section < num_sections and current_keyphrase < len(keyphrases):
        # Search for the keyphrase in the current section and move on if found
        search_result = search_for_keyphrase(
            book_name,
            current_audio_section,
            keyphrases[current_keyphrase][current_window],
        )
        if search_result is not None:
            index_search_result(
                book_name, current_audio_section, current_keyphrase, search_result
            )
            current_keyphrase += 1
            first_failed_search = None
            failed_searches = 0
            current_window = 0
            continue
        # Search for the keyphrhase in the next section. If found, next section becomes current
        # section, and keyphrase increments
        search_result = search_for_keyphrase(
            book_name, next_audio_section, keyphrases[current_keyphrase][current_window]
        )
        if search_result is not None:
            index_search_result(
                book_name, next_audio_section, current_keyphrase, search_result
            )
            current_keyphrase += 1
            current_audio_section = next_audio_section
            next_audio_section += 1
            first_failed_search = None
            failed_searches = 0
            current_window = 0
            continue
        # If we can't find this window of the keyphrase in either section,
        # progress the window and try again
        if current_window < len(keyphrases[current_keyphrase]) - 1:
            current_window += 1
            continue
        # If we can't find any of the windows, mark this as failed and move on to
        # the next keyphrase
        if first_failed_search is None:
            first_failed_search = current_keyphrase
        failed_searches += 1
        current_keyphrase += 1
        current_window = 0
        # If we've failed 5 consecutive keyphrases, assume we have a bad
        # starting point. Increment the audio sections and restart with the
        # first failed keyphrase.
        if failed_searches > 4:
            current_audio_section = next_audio_section
            next_audio_section += 1
            current_keyphrase = first_failed_search
            failed_searches = 0
            first_failed_search = None
            current_window = 0
            continue
    interpolate_index(book_name)


if __name__ == "__main__":
    interpolate_index("rhythm-of-war")
