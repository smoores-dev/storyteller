import re
from typing import List
from nltk.tokenize import sent_tokenize
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup


def window(sentence: str):
    words = sentence.split(" ")
    window_start = 1
    windows = [" ".join(words[0:4])]
    while window_start + 4 <= len(words):
        windows.append(" ".join(words[window_start : window_start + 4]))
        window_start += 1
    return windows


def simplify(sentence: str):
    return (
        re.sub("[,“”.?!…;:]", "", sentence.lower())
        .replace("’", "'")
        .replace("—", " ")
        .strip(" ")
        .replace("  ", " ")
    )


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


def get_chapter_keyphrases(book_name: str, chapter_filename: str):
    chapter_xhtml = read_chapter(book_name, chapter_filename)
    sentences = parse_chapter(chapter_xhtml)
    return [window(simplify(sentence)) for sentence in sentences]


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


def get_full_text(book_name: str) -> str:
    chapters = get_chapters(book_name)
    chapter_texts = [get_chapter_text(chapter) for chapter in chapters]
    return "\n".join(chapter_texts)


def get_windowed_keyphrases(book_name: str):
    chapters = get_chapters(book_name)
    return [
        keyphrase
        for chapter in chapters
        for keyphrase in get_chapter_keyphrases(book_name, get_chapter_text(chapter))
    ]
