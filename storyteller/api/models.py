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


class UserPermissions(BaseModel):
    book_create: bool
    book_read: bool
    book_process: bool
    book_download: bool
    book_list: bool
    user_create: bool
    user_list: bool
    user_read: bool
    user_delete: bool
    settings_update: bool


class User(BaseModel):
    username: str
    email: str | None = None
    full_name: str | None = None
    permissions: UserPermissions


class UserRequest(BaseModel):
    username: str
    email: str
    full_name: str
    password: str


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
    settings_update: bool


class Invite(BaseModel):
    email: str
    key: str


class InviteAccept(BaseModel):
    username: str
    full_name: str
    email: str
    password: str
    invite_key: str


class Settings(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    smtp_from: str
    library_name: str
    web_url: str
