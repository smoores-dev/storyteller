import os
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from storyteller.synchronize.epub import get_authors, read_epub

from .assets import persist_epub, persist_audio
from .database import create_book as create_book_db, add_audiofile
from .processing import start_processing

app = FastAPI()

origins = [
    "http://localhost:8001",
]

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


class UploadEpubResponse(BaseModel):
    bookId: int


@app.post("/books/epub")
async def upload_epub(file: UploadFile) -> UploadEpubResponse:
    original_filename, _ = os.path.splitext(file.filename)
    persist_epub(original_filename, file.file)
    book = read_epub(original_filename)
    authors = get_authors(book)
    book_id = create_book_db(book.title, authors, original_filename)
    return UploadEpubResponse(bookId=book_id)


@app.post("/books/{book_id}/audio")
async def upload_audio(book_id: int, file: UploadFile):
    original_filename, _ = os.path.splitext(file.filename)
    persist_audio(original_filename, file.file)
    add_audiofile(book_id, original_filename)


@app.post("/books/{book_id}/process")
async def process_book(book_id: int):
    start_processing(book_id)
