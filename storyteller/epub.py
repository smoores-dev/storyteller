import math
import os
import re
import zipfile
from dataclasses import dataclass
from typing import Callable, List, cast, Dict
from fuzzysearch import Match, find_near_matches
from nltk.tokenize import sent_tokenize as _sent_tokenize
from functools import cache
from ebooklib import epub, ITEM_DOCUMENT
from bs4 import BeautifulSoup, NavigableString, ResultSet, Tag

from storyteller.audio import transcribe_chapter


sent_tokenize: Callable[[str], List[str]] = cache(_sent_tokenize)


def get_chapters(book_name: str):
    book = epub.read_epub(f"/workspaces/storyteller/assets/text/{book_name}.epub")
    chapters: List[epub.EpubHtml] = [
        chapter
        for chapter in book.get_items()
        if chapter.get_type() == ITEM_DOCUMENT and chapter.is_chapter()
    ]
    return chapters


endswithalpha = re.compile(".*[a-zA-Z0-9]$")


def get_chapter_text(chapter: epub.EpubHtml):
    soup = BeautifulSoup(chapter.get_body_content(), "html.parser")
    # This is goofy, but we want nltk to treat separate textblocks as separate
    # sentences
    textblocks: ResultSet[Tag] = soup.find_all(
        ["h1", "h2", "h3", "h4", "h5", "h6", "p"]
    )
    for textblock in textblocks:
        text = textblock.get_text()
        if endswithalpha.match(text.strip()):
            textblock.append(".")
        break
    text = soup.get_text(" ")
    return text


def find_timestamps(match: Match, transcription):
    s = 0
    position = 0
    while position + len(transcription["segments"][s]["text"]) < match.start:  # type: ignore
        position += len(transcription["segments"][s]["text"]) + 1  # type: ignore
        s += 1
    w = 0
    segment = transcription["segments"][s]
    while position + len(segment["words"][w]["word"]) <= match.start:
        position += len(segment["words"][w]["word"]) + 1
        w += 1

    start_word = segment["words"][w]
    start = start_word["start"]

    while position + len(transcription["segments"][s]["text"]) < match.end:  # type: ignore
        position += len(transcription["segments"][s]["text"]) + 1  # type: ignore
        s += 1
        w = 0

    segment = transcription["segments"][s]
    while (
        w + 1 < len(segment["words"]) - 1
        and position + len(segment["words"][w]["word"]) < match.end
    ):
        position += len(segment["words"][w]["word"]) + 1
        w += 1

    end_word = segment["words"][w]
    end = end_word["end"]
    return start, end


@dataclass
class SentenceRange:
    start: float
    end: float
    sentence_number: int


def get_chapter_timestamps(transcription, chapter_text: str):
    sentences = sent_tokenize(chapter_text)
    sentence_timestamps: List[SentenceRange] = []
    transcription_text = " ".join(
        [segment["text"].lower() for segment in transcription["segments"]]
    )
    for index, sentence in enumerate(sentences):
        matches = find_near_matches(
            sentence.strip().lower(),
            transcription_text,
            max_l_dist=math.floor(0.2 * len(sentence)),
        )
        matches = cast(List[Match], matches)
        if len(matches) == 0:
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
    for id, sentence_range in enumerate(timestamps):
        par = soup.new_tag("par", id=f"sentence{id}")
        text = soup.new_tag("text", src=f"../{chapter_filename}#sentence{id}")
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


def process_chapter(audio_filename: str, chapter: epub.EpubHtml):
    chapter_text = get_chapter_text(chapter)
    transcription = transcribe_chapter(audio_filename, chapter_text)
    timestamps = get_chapter_timestamps(transcription, chapter_text)
    tag_sentences(chapter)
    chapter.add_link(
        # TODO: We can't hard-code the relative URL to the styles
        # here; we need to inspect the paths to figure it out
        rel="stylesheet", href="../Styles/storyteller-readaloud.css", type="text/css"
    )
    base_filename, _ = os.path.splitext(os.path.basename(chapter.file_name))
    _, audio_ext = os.path.splitext(audio_filename)
    audio_item = epub.EpubItem(
        uid=f"{base_filename}_audio",
        file_name=f"Audio/{base_filename}{audio_ext}",
        content=open(audio_filename, "rb").read(),
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
        duration=timestamps[-1].end,
    )


def format_duration(duration: float):
    hours = math.floor(duration / 3600)
    minutes = math.floor(duration / 60 - hours * 3600)
    seconds = duration - minutes * 60 - hours * 3600
    return f"{str(hours).zfill(2)}:{str(minutes).zfill(2)}:{round(seconds, 3)}"


if __name__ == "__main__":
    book = epub.read_epub(f"/workspaces/storyteller/assets/text/tress.epub")
    chapter_one: epub.EpubHtml = list(book.get_items())[9]
    synced = process_chapter(
        "assets/audio/tress-Chapter 01 - The Girl.mp4", chapter_one
    )
    book.add_metadata(
        None, "meta", format_duration(synced.duration), {"property": "media:duration"}
    )
    book.add_metadata(
        None,
        "meta",
        format_duration(synced.duration),
        {"property": "media:duration", "refines": f"#{synced.media_overlay.id}"},
    )
    book.add_metadata(
        None, "meta", "-epub-media-overlay-active", {"property": "media:active-class"}
    )
    book.add_item(
        epub.EpubItem(
            uid="storyteller_readaloud_styles",
            file_name="Styles/storyteller-readaloud.css",
            media_type="text/css",
            content=".-epub-media-overlay-active { background-color: #ffb; }".encode(),
        )
    )
    book.add_item(synced.audio)
    book.add_item(synced.media_overlay)
    epub.write_epub("assets/text/tress-test1.epub", book)

    # Annoying hack to prevent overwriting the existing head
    original_soup = BeautifulSoup(chapter_one.content, "html.parser")
    with zipfile.ZipFile("assets/text/tress-test1.epub") as epub_archive:
        epub_archive.filelist
        with epub_archive.open(f"EPUB/{chapter_one.file_name}", mode="r") as chapter_to_read:
            written_soup = BeautifulSoup(chapter_to_read.read(), "html.parser")
            written_soup.extend(original_soup.contents)
        with epub_archive.open(f"EPUB/{chapter_one.file_name}", mode="w") as chapter_to_write:
            chapter_to_write.write(written_soup.encode(formatter="html"))
