import os
import re
import nltk.data
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
    tokenizer = nltk.data.load("tokenizers/punkt/english.pickle")
    soup = BeautifulSoup(chapter_xhtml, "html.parser")
    tags = soup.find_all("p", attrs={"class", "CO"}) + soup.find_all(
        "p", attrs={"class", "TX"}
    )
    return [sentence for tag in tags for sentence in tokenizer.tokenize(tag.text)]


def get_chapter_keyphrases(book_name: str, chapter_filename: str):
    chapter_xhtml = read_chapter(book_name, chapter_filename)
    sentences = parse_chapter(chapter_xhtml)
    return [window(simplify(sentence)) for sentence in sentences]


def get_windowed_keyphrases(book_name: str):
    chapters = [
        chapter
        for chapter in os.listdir(
            f"/workspaces/storyteller/assets/text/{book_name}.epub/OEBPS/xhtml/"
        )
        if chapter.startswith("chapter")
    ]
    chapters.insert(0, "prologue.xhtml")
    return [
        keyphrase
        for chapter in chapters
        for keyphrase in get_chapter_keyphrases(book_name, chapter)
    ]
