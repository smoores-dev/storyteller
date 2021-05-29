from typing import Tuple
import math
from storyteller.audio import search_for_keyphrase, split_audio_file
from storyteller.epub import get_windowed_keyphrases


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
