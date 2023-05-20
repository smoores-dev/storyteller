import math
import re
from dataclasses import dataclass
from typing import List, cast, Dict
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


@dataclass
class Mark:
    tag_name: str
    attrs: Dict[str, str]


@dataclass
class TextNode:
    text: str
    marks: List[Mark]


@dataclass
class SentenceSpan:
    id: int
    sentence: str
    text_nodes: List[TextNode]


def get_textblock_spans(start_id: int, textblock: Tag):
    marks: List[Mark] = list()
    spans: List[SentenceSpan] = list()
    sentences = cast(List[str], sent_tokenize(textblock.get_text()))
    leaf = textblock.contents[0]
    leaf_index = 0
    for i, sentence in enumerate(sentences):
        span = SentenceSpan(i + start_id, sentence, [])
        spans.append(span)
        search_index = 0
        while search_index < len(sentence):
            while isinstance(leaf, Tag) and len(leaf.contents) > 0:
                tag_name = leaf.name
                attrs = leaf.attrs
                marks.append(Mark(tag_name, attrs))
                leaf = leaf.contents[0]
                leaf_index = 0
            if leaf is None:
                raise IndexError
            leaf_text = leaf.get_text()[leaf_index:]
            remaining_sentence = sentence[search_index:]
            if len(remaining_sentence) < len(leaf_text):
                leaf_index += len(remaining_sentence)
                span.text_nodes.append(TextNode(remaining_sentence, marks[:]))
                break
            search_index += len(leaf_text)
            span.text_nodes.append(TextNode(leaf_text, marks[:]))
            while not leaf.next_sibling:
                leaf = leaf.parent
                if leaf is None:
                    return spans
                if isinstance(leaf, Tag):
                    marks = [mark for mark in marks if not (mark.tag_name == leaf.name and mark.attrs == leaf.attrs)]
            leaf = leaf.next_sibling
            leaf_index = 0
        leaf_index = leaf_index if leaf_index == 0 else leaf_index + 1
    return spans


def serialize_spans(soup: BeautifulSoup, spans: List[SentenceSpan]):
    tags = []
    for span in spans:
        span_tag = soup.new_tag('span', id=f"sentence{span.id}")
        for text_node in span.text_nodes:
            text_node_tag = span_tag
            for mark in text_node.marks:
                mark_tag = soup.new_tag(mark.tag_name, **mark.attrs)
                text_node_tag.append(mark_tag)
                text_node_tag = mark_tag
            text_node_tag.append(text_node.text)
        tags.append(span_tag)
        tags.append(" ")
    return tags


def tag_sentences(chapter: epub.EpubHtml):
    content = cast(str, chapter.get_content())
    soup = BeautifulSoup(content, "html.parser")
    body_soup = soup.find("body")
    if body_soup is None:
        return
    if isinstance(body_soup, NavigableString):
        return
    textblocks: List[Tag] = body_soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'])
    start_id = 0
    for textblock in textblocks:
        spans = get_textblock_spans(start_id, textblock)
        new_content = serialize_spans(soup, spans)
        textblock.clear()
        textblock.extend(new_content)
        start_id += len(spans)
    chapter.set_content(soup.encode(formatter="html"))


def process_chapter(book_name: str, chapter_title: str, chapter: epub.EpubHtml):
    chapter_text = get_chapter_text(chapter)
    transcription = transcribe_chapter(book_name, chapter_title, chapter_text)
    timestamps = get_chapter_timestamps(transcription, chapter_text)
    print(timestamps)
    tag_sentences(chapter)

