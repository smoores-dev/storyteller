import os
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from storyteller.synchronize.epub import get_authors, read_epub

from .assets import persist_epub, persist_audio, get_synced_book_path
from .database import (
    create_book as create_book_db,
    get_book,
    add_audiofile,
    get_book_details,
    BookDetail,
)
from .processing import start_processing

app = FastAPI()

origins = os.getenv("STORYTELLER_ALLOWED_ORIGINS", "").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def index():
    return {"Hello": "World"}


@app.get("/books", response_model=list[BookDetail])
async def list_books():
    books = get_book_details()
    return books


@app.post("/books/epub", response_model=BookDetail)
async def upload_epub(file: UploadFile):
    original_filename, _ = os.path.splitext(file.filename)
    persist_epub(original_filename, file.file)
    book = read_epub(original_filename)
    authors = get_authors(book)
    book_detail = create_book_db(book.title, authors, original_filename)
    return book_detail


@app.post("/books/{book_id}/audio", response_model=None)
async def upload_audio(book_id: int, file: UploadFile):
    original_filename, _ = os.path.splitext(file.filename)
    persist_audio(original_filename, file.file)
    add_audiofile(book_id, original_filename)


@app.post("/books/{book_id}/process", response_model=None)
async def process_book(book_id: int):
    start_processing(book_id)


@app.get("/books/{book_id}/synced")
async def get_synced_book(book_id):
    book = get_book(book_id)
    response = FileResponse(get_synced_book_path(book))
    response.headers[
        "Content-Disposition"
    ] = f'attachment; filename="{book.title}.epub"'
    return response
