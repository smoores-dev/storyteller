from storyteller.synchronize.files import TEXT_DIR
from ..database import get_book


def get_synced_book_path(book_id: int):
    book = get_book(book_id)
    return f"{TEXT_DIR}/{book.epub_filename}/synced/{book.epub_filename}.epub"
