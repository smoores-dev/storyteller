import argparse

from .sync import sync_book

parser = argparse.ArgumentParser(
    prog="storyteller",
    description="Given a book name, update the ebook file with media overlays for the audiobook",
)

parser.add_argument("book_name")
parser.add_argument("audiobook_name")

args = parser.parse_args()

sync_book(args.book_name, args.audiobook_name)
