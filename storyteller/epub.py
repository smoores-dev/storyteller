import math
import re
from dataclasses import dataclass
from typing import List, cast
from fuzzysearch import Match, find_near_matches
from nltk.tokenize import sent_tokenize
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup, NavigableString, ResultSet, Tag

from .whisperaudio import transcribe_chapter

def get_chapters(book_name: str):
    book = epub.read_epub(f"/workspaces/storyteller/assets/text/{book_name}.epub")
    chapters: List[epub.EpubHtml] = [
        chapter
        for chapter in book.get_items()
        if chapter.get_type() == ebooklib.ITEM_DOCUMENT and chapter.is_chapter()
    ]
    return chapters


endswithletter = re.compile(".*[a-zA-Z]$")


def get_chapter_text(chapter: epub.EpubHtml):
    soup = BeautifulSoup(chapter.get_body_content(), "html.parser")
    # This is goofy, but we want nltk to treat separate textblocks as separate
    # sentences
    textblocks: ResultSet[Tag] = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'])
    for textblock in textblocks:
        text = textblock.get_text()
        if endswithletter.match(text.strip()):
            textblock.append(".")
        break
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
    while position + len(segment['words'][w]['word']) <= match.start:
        position += len(segment['words'][w]['word']) + 1
        w += 1

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


@dataclass
class SentenceRange:
    start: float
    end: float
    sentence_number: int


def get_chapter_timestamps(transcription, chapter_text: str):
    sentences = cast(List[str], sent_tokenize(chapter_text))
    sentence_timestamps: List[SentenceRange] = []
    transcription_text = " ".join([segment['text'].lower() for segment in transcription['segments']])
    for index, sentence in enumerate(sentences):
        matches = find_near_matches(
            sentence.strip().lower(),
            transcription_text,
            max_l_dist=math.floor(0.2 * len(sentence))
        )
        matches = cast(List[Match], matches)
        if (len(matches) == 0):
            print(f"no match for '{sentence}'")
            continue
        first_match = matches[0]
        start, end = find_timestamps(first_match, transcription)
        sentence_timestamps.append(SentenceRange(start, end, index))
    return sentence_timestamps


def tag_sentences(chapter: epub.EpubHtml):
    content = cast(str, chapter.get_content())
    soup = BeautifulSoup(content, "html.parser")
    body_soup = soup.find("body")
    if body_soup is None:
        return
    if isinstance(body_soup, NavigableString):
        return
    textblocks = body_soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'])
    # TODO: how the heck are we gonna split up sentences??
    chapter.set_content(soup.encode(formatter="html"))


def process_chapter(book_name: str, chapter_title: str, chapter: epub.EpubHtml):
    chapter_text = get_chapter_text(chapter)
    transcription = transcribe_chapter(book_name, chapter_title, chapter_text)
    timestamps = get_chapter_timestamps(transcription, chapter_text)
    print(timestamps)
    tag_sentences(chapter)

