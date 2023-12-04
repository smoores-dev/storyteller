from typing import List
from pydantic import BaseModel


class Book(BaseModel):
    id: int
    title: str
    epub_filename: str
    audio_filename: str | None
    audio_filetype: str | None


class Author(BaseModel):
    id: int
    name: str
    file_as: str


class BookAuthor(BaseModel):
    id: int
    name: str
    file_as: str
    role: str | None


class ProcessingStatus(BaseModel):
    current_task: str
    progress: float
    in_error: bool


class BookDetail(BaseModel):
    id: int
    title: str
    authors: List[BookAuthor]
    processing_status: ProcessingStatus | None


class User(BaseModel):
    username: str
    email: str | None = None
    full_name: str | None = None


class DBUser(User):
    hashed_password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: str


class InviteRequest(BaseModel):
    email: str
    book_create: bool
    book_read: bool
    book_process: bool
    book_download: bool
    book_list: bool
    user_create: bool
    user_list: bool
    user_read: bool
    user_delete: bool


class Invite(BaseModel):
    email: str
    key: str


class InviteAccept(BaseModel):
    username: str
    full_name: str
    email: str
    password: str
    invite_key: str
