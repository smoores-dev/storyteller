import json
from pathlib import Path
import re
from dataclasses import dataclass
from typing import Callable, List, Tuple, Union, cast, Dict

from nltk.tokenize import sent_tokenize as _sent_tokenize
from functools import cache
from ebooklib import epub, ITEM_DOCUMENT
from ebooklib.epub import EpubImage
from bs4 import BeautifulSoup, NavigableString, Tag

from .files import TEXT_DIR


sent_tokenize: Callable[[str], List[str]] = cache(_sent_tokenize)


@dataclass
class SentenceRange:
    id: int
    start: float
    end: float
    audiofile: str


def get_epub_directory(book_uuid: str):
    return Path(TEXT_DIR, book_uuid)


def get_epub_synced_directory(book_uuid: str):
    return get_epub_directory(book_uuid).joinpath("synced")


def get_epub_filepath(book_uuid: str):
    return get_epub_directory(book_uuid).joinpath("original", f"{book_uuid}.epub")


def get_epub_index_path(book_uuid: str):
    return get_epub_directory(book_uuid).joinpath("index.json")


def get_epub_index(book_uuid: str):
    with get_epub_index_path(book_uuid).open() as index_file:
        return json.load(index_file)


def get_epub_cover_filepath(book_uuid: str):
    try:
        index = get_epub_index(book_uuid)
    except:
        return None

    if "cover" not in index:
        return None

    return get_epub_directory(book_uuid).joinpath(index["cover"])


def persist_cover(book_uuid: str, cover_filename: str):
    try:
        index = get_epub_index(book_uuid)
    except:
        index = {}
    index["cover"] = cover_filename

    with open(get_epub_index_path(book_uuid), "w") as f:
        json.dump(index, f)


def read_epub(book_uuid: str):
    book = epub.read_epub(get_epub_filepath(book_uuid))
    for item in book.get_items_of_type(ITEM_DOCUMENT):
        if not item.is_chapter():
            continue
        soup = BeautifulSoup(item.content)

        head: Union[Tag, None] = soup.find("head")  # type: ignore
        if head is not None:
            links = head.find_all("link")
            for link in links:
                item.add_link(
                    href=link["href"],
                    rel=" ".join(link.get("rel", [])),
                    type=link.get("type"),
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
    textblocks = soup.find_all(
        ["p", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"]
    )

    return [
        re.sub(consecutivenewlines, " ", sentence)
        for textblock in textblocks
        if isinstance(textblock, Tag)
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
class Atom:
    tag_name: str
    attrs: Dict[str, str]
    marks: List[Mark]


@dataclass
class SentenceSpan:
    id: Union[int, None]
    sentence: str
    nodes: List[TextNode | Atom]
    is_offset: bool


def get_sentences_with_offsets(text: str):
    sentences = sent_tokenize(text)
    sentences_with_offsets: list[str] = []
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
            # If we still have a tag, it's an atom
            if isinstance(leaf, Tag):
                span.nodes.append(Atom(leaf.name, leaf.attrs, marks[:]))
            else:
                leaf_text = leaf.get_text()[leaf_index:]
                remaining_sentence = sentence[search_index:]
                if len(remaining_sentence) < len(leaf_text):
                    leaf_index += len(remaining_sentence)
                    span.nodes.append(TextNode(remaining_sentence, marks[:]))
                    break
                search_index += len(leaf_text)
                span.nodes.append(TextNode(leaf_text, marks[:]))

            while not leaf.next_sibling and leaf.parent is not textblock:
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

    while leaf:
        span = SentenceSpan(None, "", [], True)
        spans.append(span)

        while isinstance(leaf, Tag) and len(leaf.contents) > 0:
            tag_name = leaf.name
            attrs = leaf.attrs
            marks.append(Mark(tag_name, attrs))
            leaf = leaf.contents[0]
            leaf_index = 0
        if leaf is None:
            raise IndexError
        # If we still have a tag, it's an atom
        if isinstance(leaf, Tag):
            span.nodes.append(Atom(leaf.name, leaf.attrs, marks[:]))

        leaf = leaf.next_sibling
        leaf_index = 0

    return spans


def serialize_spans(soup: BeautifulSoup, spans: List[SentenceSpan]):
    tags = []
    for span in spans:
        if span.is_offset:
            parent = tags
        else:
            parent = soup.new_tag("span", id=f"sentence{span.id}")
            tags.append(parent)
        for node in span.nodes:
            text_node_tag = parent
            for mark in node.marks:
                mark_tag = soup.new_tag(mark.tag_name, **mark.attrs)
                text_node_tag.append(mark_tag)
                text_node_tag = mark_tag
            text_node_tag.append(
                soup.new_tag(node.tag_name, **node.attrs)
                if isinstance(node, Atom)
                else node.text
            )

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
    textblocks = body_soup.find_all(
        ["p", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"]
    )
    start_id = 0
    for textblock in textblocks:
        if not isinstance(textblock, Tag):
            continue

        spans = get_textblock_spans(start_id, textblock)
        new_content = serialize_spans(soup, spans)
        textblock.clear()
        textblock.extend(new_content)

        try:
            start_id = get_last_span_id(spans) + 1
        except StopIteration:
            pass

    chapter.set_content(soup.encode())


def get_epub_audio_filename(audio_filename: str) -> str:
    return f"Audio/{Path(audio_filename).name}"


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
        par.append("\n")
        par.append(audio)
        par.append("\n")
        seq.append(par)
        seq.append("\n")
    return soup.encode(formatter="minimal")


def process_epub(book_uuid: str):
    epub = read_epub(book_uuid)

    [(_, cover_image_meta)] = epub.get_metadata("OPF", "cover")
    cover_image_item_id = cover_image_meta["content"]
    cover_image = cast(EpubImage, epub.get_item_with_id(cover_image_item_id))
    cover_image_filename = Path(cover_image.file_name).name

    cover_image_filepath = get_epub_directory(book_uuid).joinpath(cover_image_filename)
    cover_image_filepath.write_bytes(cover_image.get_content())

    persist_cover(book_uuid, cover_image_filename)
