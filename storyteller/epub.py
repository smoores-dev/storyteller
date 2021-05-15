import re
import nltk.data
from bs4 import BeautifulSoup


def simplify(sentence: str):
    simplified = re.sub("[,“”.]", "", sentence.lower()).replace("’", "'").replace("—", " ")
    return ' '.join(simplified.split(' ')[0:4])


def read_chapter(chapter_filepath: str):
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


def get_chapter_keyphrases(chapter_filepath: str):
    chapter_xhtml = read_chapter(chapter_filepath)
    sentences = parse_chapter(chapter_xhtml)
    return [simplify(sentence) for sentence in sentences]
