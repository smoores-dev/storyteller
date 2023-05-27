import math
import os
import re
import whisperx.types
from dataclasses import dataclass
from typing import Callable, List, cast, Dict

# from fuzzysearch import Match
from nltk.tokenize import sent_tokenize as _sent_tokenize
from functools import cache
from ebooklib import epub, ITEM_DOCUMENT
from bs4 import BeautifulSoup, NavigableString, ResultSet, Tag
from mutagen.mp4 import MP4

from storyteller.audio import SentenceRange, get_chapter_timestamps


sent_tokenize: Callable[[str], List[str]] = cache(_sent_tokenize)


def read_epub(book_name: str):
    book = epub.read_epub(f"assets/text/{book_name}/original/{book_name}.epub")
    for item in book.get_items_of_type(ITEM_DOCUMENT):
        if not item.is_chapter():
            continue
        soup = BeautifulSoup(item.content)

        head: Tag | None = soup.find("head")  # type: ignore
        if head is not None:
            links = head.find_all("link")
            for link in links:
                item.add_link(
                    href=link["href"], rel=" ".join(link["rel"]), type=link["type"]
                )
    return book


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
    id: int
    sentence: str
    text_nodes: List[TextNode]


def get_textblock_spans(start_id: int, textblock: Tag):
    marks: List[Mark] = list()
    spans: List[SentenceSpan] = list()
    sentences = sent_tokenize(textblock.get_text())
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
                    marks = [
                        mark
                        for mark in marks
                        if not (mark.tag_name == leaf.name and mark.attrs == leaf.attrs)
                    ]
            leaf = leaf.next_sibling
            leaf_index = 0
        leaf_index = leaf_index if leaf_index == 0 else leaf_index + 1
    return spans


def serialize_spans(soup: BeautifulSoup, spans: List[SentenceSpan]):
    tags = []
    for span in spans:
        span_tag = soup.new_tag("span", id=f"sentence{span.id}")
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
    textblocks: List[Tag] = body_soup.find_all(
        ["h1", "h2", "h3", "h4", "h5", "h6", "p"]
    )
    start_id = 0
    for textblock in textblocks:
        spans = get_textblock_spans(start_id, textblock)
        new_content = serialize_spans(soup, spans)
        textblock.clear()
        textblock.extend(new_content)
        start_id += len(spans)
    chapter.set_content(soup.encode(formatter="html"))
    return start_id


def create_media_overlay(
    base_filename: str,
    chapter_filename: str,
    audio_filename: str,
    timestamps: List[SentenceRange],
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
    for sentence_range in timestamps:
        par = soup.new_tag("par", id=f"sentence{sentence_range.id}")
        text = soup.new_tag(
            "text", src=f"../{chapter_filename}#sentence{sentence_range.id}"
        )
        audio = soup.new_tag(
            "audio",
            src=f"../{audio_filename}",
            clipBegin=f"{sentence_range.start}s",
            clipEnd=f"{sentence_range.end}s",
        )
        par.append(text)
        par.append(audio)
        seq.append(par)
    return soup.encode(formatter="minimal")


@dataclass
class SyncedChapter:
    chapter: epub.EpubHtml
    audio: epub.EpubItem
    media_overlay: epub.EpubSMIL
    duration: float


def sync_chapter(
    mp4: MP4,
    transcription: whisperx.types.AlignedTranscriptionResult,
    chapter: epub.EpubHtml,
):
    chapter_sentences = get_chapter_sentences(chapter)
    timestamps = get_chapter_timestamps(
        transcription, chapter_sentences, mp4.info.length
    )
    tag_sentences(chapter)
    chapter_filepath_length = len(chapter.file_name.split(os.path.sep)) - 1
    relative_ups = "../" * chapter_filepath_length
    chapter.add_link(
        rel="stylesheet",
        href=f"{relative_ups}Styles/storyteller-readaloud.css",
        type="text/css",
    )
    base_filename, _ = os.path.splitext(os.path.basename(chapter.file_name))
    _, audio_ext = os.path.splitext(mp4.filename)  # type: ignore
    audio_item = epub.EpubItem(
        uid=f"{base_filename}_audio",
        file_name=f"Audio/{base_filename}{audio_ext}",
        content=open(mp4.filename, "rb").read(),  # type: ignore
        media_type="audio/mpeg",
    )
    media_overlay_item = epub.EpubSMIL(
        uid=f"{base_filename}_overlay",
        file_name=f"MediaOverlays/{base_filename}.smil",
        content=create_media_overlay(
            base_filename, chapter.file_name, audio_item.file_name, timestamps
        ),
    )
    chapter.media_overlay = media_overlay_item.id
    return SyncedChapter(
        chapter=chapter,
        audio=audio_item,
        media_overlay=media_overlay_item,
        duration=timestamps[-1].end if len(timestamps) else 0,
    )


def format_duration(duration: float):
    hours = math.floor(duration / 3600)
    minutes = math.floor(duration / 60 - hours * 3600)
    seconds = duration - minutes * 60 - hours * 3600
    return f"{str(hours).zfill(2)}:{str(minutes).zfill(2)}:{round(seconds, 3)}"


def update_synced_chapter(book: epub.EpubBook, synced: SyncedChapter):
    book.add_metadata(
        None,
        "meta",
        format_duration(synced.duration),
        {"property": "media:duration", "refines": f"#{synced.media_overlay.id}"},
    )

    book.add_item(synced.audio)
    book.add_item(synced.media_overlay)


# if __name__ == "__main__":
# book = read_epub("tress")
# chapter_one: epub.EpubHtml = list(book.get_items())[9]
# synced = sync_chapter(
#     "assets/audio/tress/chapters/tress-Chapter 01 - The Girl.mp4", chapter_one
# )
# book.add_metadata(
#     None, "meta", format_duration(synced.duration), {"property": "media:duration"}
# )
# book.add_metadata(
#     None,
#     "meta",
#     format_duration(synced.duration),
#     {"property": "media:duration", "refines": f"#{synced.media_overlay.id}"},
# )
# book.add_metadata(
#     None, "meta", "-epub-media-overlay-active", {"property": "media:active-class"}
# )
# book.add_item(
#     epub.EpubItem(
#         uid="storyteller_readaloud_styles",
#         file_name="Styles/storyteller-readaloud.css",
#         media_type="text/css",
#         content=".-epub-media-overlay-active { background-color: #ffb; }".encode(),
#     )
# )
# book.add_item(synced.audio)
# book.add_item(synced.media_overlay)
# epub.write_epub("assets/text/tress-test1.epub", book)
