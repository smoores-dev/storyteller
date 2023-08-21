from datetime import timedelta
from functools import lru_cache
import os
from typing import Annotated, cast
from fastapi import FastAPI, HTTPException, UploadFile, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from storyteller.synchronize.epub import get_authors, read_epub

from .assets import persist_epub, persist_audio, get_synced_book_path
from .database import (
    create_book as create_book_db,
    get_book,
    add_audiofile,
    get_book_details as get_book_details_db,
    migrate,
)

from .models import Token, BookDetail
from .processing import start_processing
from .auth import (
    ACCESS_TOKEN_EXPIRE_DAYS,
    authenticate_user,
    create_access_token,
    has_permission,
    verify_token,
)
from .config import Settings


@lru_cache()
def get_settings():
    return Settings()


app = FastAPI()

origins = get_settings().allowed_origins.split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    print("Running database migrations")
    migrate()


@app.get("/")
def index():
    return {"Hello": "World"}


@app.post("/token", response_model=Token)
async def login(form_data: Annotated[OAuth2PasswordRequestForm, Depends()]):
    user = authenticate_user(form_data.username, form_data.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password",
        )

    access_token_expires = timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.get(
    "/books",
    dependencies=[Depends(has_permission("book_list"))],
    response_model=list[BookDetail],
)
async def list_books():
    books = get_book_details_db()
    return reversed(books)


@app.post(
    "/books/epub",
    dependencies=[Depends(has_permission("book_create"))],
    response_model=BookDetail,
)
async def upload_epub(file: UploadFile):
    original_filename, _ = os.path.splitext(cast(str, file.filename))
    persist_epub(original_filename, file.file)
    book = read_epub(original_filename)
    authors = get_authors(book)
    book_detail = create_book_db(book.title, authors, original_filename)
    return book_detail


@app.post(
    "/books/{book_id}/audio",
    dependencies=[Depends(has_permission("book_create"))],
    response_model=None,
)
async def upload_audio(book_id: int, file: UploadFile):
    print(file.filename)
    original_filename, extension = os.path.splitext(cast(str, file.filename))
    extension = extension[1:]
    if extension in ["m4b", "m4a"]:
        extension = "mp4"
    if extension not in ["zip", "mp4"]:
        print(f"Received unsupported media type {extension}")
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Please upload an mp4 (file extension mp4, m4a, or m4b) or zip of mp3 files",
        )
    persist_audio(original_filename, extension, file.file)
    add_audiofile(book_id, original_filename, extension)


@app.post(
    "/books/{book_id}/process",
    dependencies=[Depends(has_permission("book_process"))],
    response_model=None,
)
async def process_book(book_id: int, restart=False):
    start_processing(book_id, restart)


@app.get(
    "/books/{book_id}",
    dependencies=[Depends(has_permission("book_read"))],
    response_model=BookDetail,
)
async def get_book_details(book_id: int):
    (book,) = get_book_details_db([book_id])
    return book


@app.get(
    "/books/{book_id}/synced",
    dependencies=[Depends(has_permission("book_download"))],
)
async def get_synced_book(book_id):
    book = get_book(book_id)
    response = FileResponse(get_synced_book_path(book))
    response.headers[
        "Content-Disposition"
    ] = f'attachment; filename="{book.title}.epub"'
    return response
