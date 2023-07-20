from datetime import timedelta
import os
from typing import Annotated
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

from .models import Token, User, BookDetail
from .processing import start_processing
from .auth import (
    ACCESS_TOKEN_EXPIRE_DAYS,
    authenticate_user,
    create_access_token,
    get_current_user,
    verify_token,
)

app = FastAPI()

origins = os.getenv("STORYTELLER_ALLOWED_ORIGINS", "").split(",")

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
    "/books", dependencies=[Depends(verify_token)], response_model=list[BookDetail]
)
async def list_books():
    books = get_book_details_db()
    return books


@app.post(
    "/books/epub", dependencies=[Depends(verify_token)], response_model=BookDetail
)
async def upload_epub(file: UploadFile):
    original_filename, _ = os.path.splitext(file.filename)
    persist_epub(original_filename, file.file)
    book = read_epub(original_filename)
    authors = get_authors(book)
    book_detail = create_book_db(book.title, authors, original_filename)
    return book_detail


@app.post(
    "/books/{book_id}/audio", dependencies=[Depends(verify_token)], response_model=None
)
async def upload_audio(book_id: int, file: UploadFile):
    original_filename, _ = os.path.splitext(file.filename)
    persist_audio(original_filename, file.file)
    add_audiofile(book_id, original_filename)


@app.post(
    "/books/{book_id}/process",
    dependencies=[Depends(verify_token)],
    response_model=None,
)
async def process_book(book_id: int):
    start_processing(book_id)


@app.get(
    "/books/{book_id}", dependencies=[Depends(verify_token)], response_model=BookDetail
)
async def get_book_details(book_id: int):
    (book,) = get_book_details_db([book_id])
    return book


@app.get("/books/{book_id}/synced", dependencies=[Depends(verify_token)])
async def get_synced_book(book_id):
    book = get_book(book_id)
    response = FileResponse(get_synced_book_path(book))
    response.headers[
        "Content-Disposition"
    ] = f'attachment; filename="{book.title}.epub"'
    return response
