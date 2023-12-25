from datetime import timedelta
from email.utils import formatdate
from functools import lru_cache
import os
import secrets
from typing import Annotated, cast
from fastapi import (
    Body,
    FastAPI,
    HTTPException,
    Header,
    Request,
    UploadFile,
    Depends,
    status,
)
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse, StreamingResponse

from starlette.types import Message
from starlette.background import BackgroundTask
from starlette._compat import md5_hexdigest

from storyteller.synchronize.epub import get_authors, read_epub, get_cover_image
from storyteller.synchronize.audio import get_audio_cover_image

from . import assets, auth, config, database as db, invites, models, processing


app = FastAPI(root_path=f"{config.config.root_path}/api")

origins = config.config.allowed_origins.split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def set_body(request: Request, body: bytes):
    async def receive() -> Message:
        return {"type": "http.request", "body": body}

    request._receive = receive


if config.config.debug_requests:

    @app.middleware("http")
    async def debug_log_middleware(request: Request, call_next):
        req_body = await request.body()
        await set_body(request, req_body)
        response = await call_next(request)

        res_body = b""
        async for chunk in response.body_iterator:
            res_body += chunk

        def print_logs(
            req_headers: dict[str, str], req_body: bytes, res_headers: dict[str, str]
        ):
            print(f"Request headers: {req_headers}")
            print(f"Request body: {req_body}")
            print(f"Response headers: {res_headers}")

        task = BackgroundTask(
            print_logs, dict(request.headers), req_body, dict(response.headers)
        )
        return Response(
            content=res_body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
            background=task,
        )


@app.on_event("startup")
async def startup_event():
    print("Running database migrations")
    db.migrate()


@app.get("/")
def index():
    return {"Hello": "World"}


@app.get("/needs-init")
def needs_init():
    count = db.get_user_count()
    if count > 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

    return True


@app.post("/token", response_model=models.Token)
async def login(form_data: Annotated[OAuth2PasswordRequestForm, Depends()]):
    user = auth.authenticate_user(form_data.username, form_data.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password",
        )

    access_token_expires = timedelta(days=auth.ACCESS_TOKEN_EXPIRE_DAYS)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/validate", dependencies=[Depends(auth.verify_token)], response_model=str)
async def validate_token():
    return "ok"


@app.get(
    "/users",
    dependencies=[Depends(auth.has_permission("user_list"))],
    response_model=list[models.User],
)
async def list_users():
    users = db.get_users()
    return users


@app.post(
    "/invites",
    dependencies=[Depends(auth.has_permission("user_create"))],
    response_model=models.Invite,
)
async def create_invite(invite: models.InviteRequest):
    key = secrets.randbits(48).to_bytes(6, "big").hex()
    db.create_invite(
        invite.email,
        key,
        invite.book_create,
        invite.book_read,
        invite.book_process,
        invite.book_download,
        invite.book_list,
        invite.user_create,
        invite.user_list,
        invite.user_read,
        invite.user_delete,
        invite.settings_update,
    )
    invites.send_invite(invite.email, key)
    return models.Invite(email=invite.email, key=key)


@app.get("/invites/{invite_key}", response_model=models.Invite)
async def get_invite(invite_key: str):
    return db.get_invite(invite_key)


@app.post(
    "/users", dependencies=[Depends(auth.verify_invite)], response_model=models.Token
)
async def accept_invite(invite: models.InviteAccept):
    hashed_password = auth.get_password_hash(invite.password)
    db.create_user(
        invite.username,
        invite.full_name,
        invite.email,
        hashed_password,
        invite.invite_key,
    )
    access_token_expires = timedelta(days=auth.ACCESS_TOKEN_EXPIRE_DAYS)
    access_token = auth.create_access_token(
        data={"sub": invite.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/users/admin", response_model=models.Token)
async def create_admin(user_request: Annotated[models.UserRequest, Body()]):
    hashed_password = auth.get_password_hash(user_request.password)
    db.create_admin_user(
        user_request.username,
        user_request.full_name,
        user_request.email,
        hashed_password,
    )
    access_token_expires = timedelta(days=auth.ACCESS_TOKEN_EXPIRE_DAYS)
    access_token = auth.create_access_token(
        data={"sub": user_request.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/user", response_model=models.User)
async def get_current_user(
    current_user: Annotated[models.User, Depends(auth.get_current_user)]
):
    return current_user


@app.get(
    "/settings",
    dependencies=[Depends(auth.has_permission("settings_update"))],
    response_model=models.Settings,
)
async def get_settings():
    settings = db.get_settings()
    return settings


@app.put(
    "/settings",
    dependencies=[Depends(auth.has_permission("settings_update"))],
)
async def update_settings(settings: Annotated[models.Settings, Body()]):
    db.update_settings(settings)


@app.get(
    "/books",
    dependencies=[Depends(auth.has_permission("book_list"))],
    response_model=list[models.BookDetail],
)
async def list_books(synced=False):
    books = db.get_book_details(synced_only=synced)
    return reversed(books)


@app.post(
    "/books/epub",
    dependencies=[Depends(auth.has_permission("book_create"))],
    response_model=models.BookDetail,
)
async def upload_epub(file: UploadFile):
    original_filename, _ = os.path.splitext(cast(str, file.filename))
    assets.persist_epub(original_filename, file.file)
    book = read_epub(original_filename)
    authors = get_authors(book)
    book_detail = db.create_book(book.title, authors, original_filename)
    return book_detail


@app.post(
    "/books/{book_id}/audio",
    dependencies=[Depends(auth.has_permission("book_create"))],
    response_model=None,
)
async def upload_audio(book_id: int, file: UploadFile):
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
    assets.persist_audio(original_filename, extension, file.file)
    db.add_audiofile(book_id, original_filename, extension)


@app.post(
    "/books/{book_id}/process",
    dependencies=[Depends(auth.has_permission("book_process"))],
    response_model=None,
)
async def process_book(book_id: int, restart=False):
    processing.start_processing(book_id, restart)


@app.get(
    "/books/{book_id}",
    dependencies=[Depends(auth.has_permission("book_read"))],
    response_model=models.BookDetail,
)
async def get_book_details(book_id: int):
    (book,) = db.get_book_details([book_id])
    return book


@app.get(
    "/books/{book_id}/synced",
    dependencies=[Depends(auth.has_permission("book_download"))],
)
def get_synced_book(
    book_id,
    range: Annotated[str | None, Header()] = None,
    if_range: Annotated[str | None, Header()] = None,
):
    book = db.get_book(book_id)
    filepath = assets.get_synced_book_path(book)

    stat_result = os.stat(filepath)
    last_modified = formatdate(stat_result.st_mtime, usegmt=True)
    etag_base = str(stat_result.st_mtime) + "-" + str(stat_result.st_size)
    etag = f'"{md5_hexdigest(etag_base.encode(), usedforsecurity=False)}"'

    start = 0
    end = stat_result.st_size

    partial_response = (
        range is not None
        and range.startswith("bytes=")
        and (if_range == etag or if_range == last_modified)
    )
    if partial_response:
        ranges_str = cast(str, range).replace("bytes=", "")
        range_strs = ranges_str.split(",")
        ranges = [range_str.strip().split("-") for range_str in range_strs]
        # TODO: handle multiple ranges?
        [[start_str, end_str]] = ranges
        try:
            start = int(start_str.strip())
        except:
            pass
        try:
            end = int(end_str.strip())
        except:
            pass

    with open(filepath, mode="rb") as f:
        f.seek(start)
        return Response(
            content=f.read(end - start),
            status_code=206 if partial_response else 200,
            headers={
                "Content-Disposition": f'attachment; filename="{book.title}.epub"',
                "Content-Type": "application/epub+zip",
                "Accept-Ranges": "bytes",
                "Content-Length": str(end - start),
                "Last-Modified": last_modified,
                "Etag": etag,
            },
        )


def get_epub_book_cover(book: models.Book):
    return get_cover_image(book.epub_filename)


def get_audio_book_cover(book: models.Book):
    if book.audio_filename is None or book.audio_filetype is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    cover = get_audio_cover_image(book.audio_filename, book.audio_filetype)
    if cover is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return cover


@app.get(
    "/books/{book_id}/cover", dependencies=[Depends(auth.has_permission("book_read"))]
)
async def get_book_cover(book_id, audio=False):
    book = db.get_book(book_id)
    cover, ext = get_audio_book_cover(book) if audio else get_epub_book_cover(book)
    response = Response(cover)
    response.headers[
        "Content-Disposition"
    ] = f'attachment; filename="{book.title} {"Audio " if audio else ""}Cover.{ext}"'
    return response


@app.post(
    "/books/{book_id}/cover", dependencies=[Depends(auth.has_permission("book_create"))]
)
async def upload_book_cover(book_id: int, file: UploadFile):
    book = db.get_book(book_id)
    _, extension = os.path.splitext(cast(str, file.filename))
    extension = extension[1:]
    if book.audio_filename is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Book is missing audio file. Upload audio file before custom cover art.",
        )

    assets.persist_audio_cover(book.audio_filename, extension, file.file)
