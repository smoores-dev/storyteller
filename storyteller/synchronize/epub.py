import os
import re
from dataclasses import dataclass
from typing import Callable, List, Tuple, TypedDict, Union, cast, Dict

from nltk.tokenize import sent_tokenize as _sent_tokenize
from functools import cache
from ebooklib import epub, ITEM_DOCUMENT
from bs4 import BeautifulSoup, NavigableString, ResultSet, Tag

from .files import TEXT_DIR


sent_tokenize: Callable[[str], List[str]] = cache(_sent_tokenize)


@dataclass
class SentenceRange:
    id: int
    start: float
    end: float
    audiofile: str


def get_epub_filepath(book_name: str):
    return f"{TEXT_DIR}/{book_name}/original/{book_name}.epub"


def read_epub(book_name: str):
    book = epub.read_epub(get_epub_filepath(book_name))
    for item in book.get_items_of_type(ITEM_DOCUMENT):
        if not item.is_chapter():
            continue
        soup = BeautifulSoup(item.content)

        head: Union[Tag, None] = soup.find("head")  # type: ignore
        if head is not None:
            links = head.find_all("link")
            for link in links:
                item.add_link(
                    href=link["href"], rel=" ".join(link["rel"]), type=link["type"]
                )
    return book


@dataclass
class EpubAuthor:
    name: str
    file_as: str
    role: Union[str, None]


def parse_author_metadata(metadata: Tuple[str, Dict[str, str]]):
    name = metadata[0]
    file_as = name
    role = None

    for key, value in metadata[1].items():
        if key.endswith("file-as"):
            file_as = value
        if key.endswith("role"):
            role = value

    return EpubAuthor(name, file_as, role)


def get_authors(book: epub.EpubBook) -> List[EpubAuthor]:
    metadata = book.get_metadata("DC", "creator")
    return [parse_author_metadata(md) for md in metadata]


def get_chapters(book: epub.EpubBook) -> List[epub.EpubHtml]:
    spine_ids = [item[0] for item in book.spine]
    chapters = [cast(epub.EpubHtml, book.get_item_with_id(id)) for id in spine_ids]
    return chapters


endswithalpha = re.compile(".*[a-zA-Z0-9]$")
consecutivenewlines = re.compile("[\n ]+")


@cache
def get_chapter_text(chapter: epub.EpubHtml):
    soup = BeautifulSoup(chapter.get_body_content(), "html.parser")
    return re.sub(consecutivenewlines, " ", soup.get_text())


@cache
def get_chapter_sentences(chapter: epub.EpubHtml):
    soup = BeautifulSoup(chapter.get_body_content(), "html.parser")
    textblocks: ResultSet[Tag] = soup.find_all(
        ["h1", "h2", "h3", "h4", "h5", "h6", "p"]
    )

    return [
        re.sub(consecutivenewlines, " ", sentence)
        for textblock in textblocks
        for sentence in sent_tokenize(textblock.get_text())
    ]


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
    id: Union[int, None]
    sentence: str
    text_nodes: List[TextNode]
    is_offset: bool


def get_sentences_with_offsets(text: str):
    sentences = sent_tokenize(text)
    sentences_with_offsets = []
    last_sentence_end = 0
    for sentence in sentences:
        sentence_start = text.find(sentence, last_sentence_end)
        if sentence_start > last_sentence_end:
            sentences_with_offsets.append(text[last_sentence_end:sentence_start])

        sentences_with_offsets.append(sentence)
        last_sentence_end = sentence_start + len(sentence)

    if len(text) > last_sentence_end:
        sentences_with_offsets.append(text[last_sentence_end:])

    return sentences_with_offsets


def get_textblock_spans(start_id: int, textblock: Tag):
    marks: List[Mark] = list()
    spans: List[SentenceSpan] = list()
    sentences = get_sentences_with_offsets(textblock.get_text())

    if len(textblock.contents) == 0:
        return spans

    leaf = textblock.contents[0]
    leaf_index = 0
    sentence_id = 0
    for sentence in sentences:
        if sentence.isspace():
            span = SentenceSpan(None, sentence, [], True)
        else:
            span = SentenceSpan(sentence_id + start_id, sentence, [], False)
            sentence_id += 1

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
                    marks = [
                        mark
                        for mark in marks
                        if not (mark.tag_name == leaf.name and mark.attrs == leaf.attrs)
                    ]
            leaf = leaf.next_sibling
            leaf_index = 0
    return spans


def serialize_spans(soup: BeautifulSoup, spans: List[SentenceSpan]):
    tags = []
    for span in spans:
        span_tag = soup.new_tag("span")
        if not span.is_offset:
            span_tag["id"] = f"sentence{span.id}"
        for text_node in span.text_nodes:
            text_node_tag = span_tag
            for mark in text_node.marks:
                mark_tag = soup.new_tag(mark.tag_name, **mark.attrs)
                text_node_tag.append(mark_tag)
                text_node_tag = mark_tag
            text_node_tag.append(text_node.text)
        tags.append(span_tag)
    return tags


def get_last_span_id(spans: List[SentenceSpan]) -> int:
    return cast(int, next(filter(lambda s: not s.is_offset, reversed(spans))).id)


def tag_sentences(chapter: epub.EpubHtml):
    content = cast(str, chapter.get_content())
    soup = BeautifulSoup(content, "html.parser")
    body_soup = soup.find("body")
    if body_soup is None:
        return
    if isinstance(body_soup, NavigableString):
        return
    textblocks: List[Tag] = body_soup.find_all(
        ["h1", "h2", "h3", "h4", "h5", "h6", "p"]
    )
    start_id = 0
    for textblock in textblocks:
        spans = get_textblock_spans(start_id, textblock)
        new_content = serialize_spans(soup, spans)
        textblock.clear()
        textblock.extend(new_content)

        try:
            start_id = get_last_span_id(spans) + 1
        except StopIteration:
            pass

        chapter.set_content(soup.encode(formatter="html"))


def get_epub_audio_filename(audio_filename: str) -> str:
    return f"Audio/{os.path.basename(audio_filename)}"


def create_media_overlay(
    base_filename: str,
    chapter_filename: str,
    sentence_ranges: List[SentenceRange],
):
    soup = BeautifulSoup(
        """
<smil xmlns="http://www.w3.org/ns/SMIL" xmlns:epub="http://www.idpf.org/2007/ops" version="3.0">
    <body>
    </body>
</smil>
""",
        "xml",
    )

    seq = soup.new_tag("seq", id=f"{base_filename}_overlay")
    seq["epub:textref"] = f"../{chapter_filename}"
    seq["epub:type"] = "chapter"
    soup.body.append(seq)  # type: ignore
    for sentence_range in sentence_ranges:
        par = soup.new_tag("par", id=f"sentence{sentence_range.id}")
        text = soup.new_tag(
            "text", src=f"../{chapter_filename}#sentence{sentence_range.id}"
        )
        audio = soup.new_tag(
            "audio",
            src=f"../{get_epub_audio_filename(sentence_range.audiofile)}",
            clipBegin=f"{sentence_range.start}s",
            clipEnd=f"{sentence_range.end}s",
        )
        par.append(text)
        par.append(audio)
        seq.append(par)
    return soup.encode(formatter="minimal")
