from storyteller.synchronize.files import TEXT_DIR
from ..models import Book


def get_synced_book_path(book: Book):
    return f"{TEXT_DIR}/{book.uuid}/synced/{book.uuid}.epub"
