from typing import List
from fastapi import File, UploadFile
from pydantic import BaseModel


class Book(BaseModel):
    uuid: str
    id: int | None
    title: str


class Author(BaseModel):
    uuid: str
    name: str
    file_as: str


class BookAuthor(BaseModel):
    uuid: str
    name: str
    file_as: str
    role: str | None


class ProcessingStatus(BaseModel):
    current_task: str
    progress: float
    in_error: bool


class BookDetail(BaseModel):
    uuid: str
    id: int | None
    title: str
    authors: List[BookAuthor]
    processing_status: ProcessingStatus | None


class BookUpdate(BaseModel):
    title: str
    # authors: List[BookAuthor]
    text_cover: UploadFile | None
    audio_cover: UploadFile | None


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
    book_delete: bool
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
