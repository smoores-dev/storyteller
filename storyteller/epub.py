import math
import re
from typing import List, cast
from fuzzysearch import Match, find_near_matches
from nltk.tokenize import sent_tokenize
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup

def read_chapter(book_name: str, chapter_filename: str):
    chapter_filepath = f"/workspaces/storyteller/assets/text/{book_name}.epub/OEBPS/xhtml/{chapter_filename}"
    with open(chapter_filepath) as chapter_descriptor:
        xhtml = chapter_descriptor.read()
    return xhtml


def parse_chapter(chapter_xhtml: str):
    soup = BeautifulSoup(chapter_xhtml, "html.parser")
    tags = soup.find_all("p", attrs={"class", "CO"}) + soup.find_all(
        "p", attrs={"class", "TX"}
    )
    return [sentence for tag in tags for sentence in sent_tokenize(tag.text)]


def get_chapters(book_name: str):
    book = epub.read_epub(f"/workspaces/storyteller/assets/text/{book_name}.epub")
    chapters: List[epub.EpubHtml] = [
        chapter
        for chapter in book.get_items()
        if chapter.get_type() == ebooklib.ITEM_DOCUMENT and chapter.is_chapter()
    ]
    return chapters


def get_chapter_text(chapter: epub.EpubHtml):
    soup = BeautifulSoup(chapter.get_body_content(), "html.parser")
    text = soup.get_text(" ")
    return text


def find_timestamps(match: Match, transcription):
    s = 0
    position = 0
    while position + len(transcription['segments'][s]['text']) < match.start: # type: ignore
        position += len(transcription['segments'][s]['text']) + 1 # type: ignore
        s += 1
    w = 0
    segment = transcription['segments'][s]
    try:
        segment['words'][w]['word']
    except:
        print(match, position, w, len(segment['words']))
    while position + len(segment['words'][w]['word']) <= match.start:
        position += len(segment['words'][w]['word']) + 1
        w += 1
        try:
            segment['words'][w]['word']
        except:
            print(match, position, w, len(segment['words']))

    start_word = segment['words'][w]
    start = start_word['start']

    while position + len(transcription['segments'][s]['text']) < match.end: # type: ignore
        position += len(transcription['segments'][s]['text']) + 1 # type: ignore
        s += 1
        w = 0

    segment = transcription['segments'][s]
    while w + 1 < len(segment['words']) - 1 and position + len(segment['words'][w]['word']) < match.end:
        position += len(segment['words'][w]['word']) + 1
        w += 1

    end_word = segment['words'][w]
    end = end_word['end']
    return start, end


def get_chapter_timestamps(transcription, chapter: epub.EpubHtml):
    chapter_text = get_chapter_text(chapter)
    # TODO: figure out how to strip titles since they're spoken different?
    sentences = cast(List[str], sent_tokenize(chapter_text))
    sentence_timestamps = []
    transcription_text = " ".join([segment['text'] for segment in transcription['segments']])
    for sentence in sentences:
        matches = find_near_matches(
            sentence,
            transcription_text,
            max_l_dist=math.floor(0.2 * len(sentence))
        )
        matches = cast(List[Match], matches)
        if (len(matches) == 0):
            print(f"no match for '{sentence}'")
            continue
        first_match = matches[0]
        start, end = find_timestamps(first_match, transcription)
        sentence_timestamps.append((sentence, start, end))
    return sentence_timestamps



def get_full_text(book_name: str) -> str:
    chapters = get_chapters(book_name)
    chapter_texts = [get_chapter_text(chapter) for chapter in chapters]
    return "\n".join(chapter_texts)
