import base64
from datetime import timedelta, datetime
import json
import os
from typing import Annotated, Optional, cast
from urllib.parse import unquote

from jose import JWTError, jwt
from fastapi import Body, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from starlette.status import HTTP_401_UNAUTHORIZED

from .models import InviteAccept, TokenData

from . import database as db

SECRET_KEY = os.getenv("STORYTELLER_SECRET_KEY", "<notsosecret>")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 10


class OAuth2PasswordBearerWithCookie(OAuth2PasswordBearer):
    async def __call__(self, request: Request) -> Optional[str]:
        header_param = None
        try:
            header_param = await super().__call__(request)
        except HTTPException:
            pass
        if header_param is not None:
            return header_param

        auth_cookie = request.cookies.get("st_token")

        if not auth_cookie:
            if self.auto_error:
                raise HTTPException(
                    status_code=HTTP_401_UNAUTHORIZED,
                    detail="Not authenticated",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            else:
                return None

        auth_token = json.loads(base64.urlsafe_b64decode(unquote(auth_cookie)))
        access_token = auth_token["access_token"]

        if not access_token:
            if self.auto_error:
                raise HTTPException(
                    status_code=HTTP_401_UNAUTHORIZED,
                    detail="Not authenticated",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            else:
                return None

        return access_token


oauth2_scheme = OAuth2PasswordBearerWithCookie(tokenUrl="token")

password_context = CryptContext(schemes=["argon2"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str):
    return password_context.verify(plain_password, hashed_password)


def get_password_hash(password: str):
    return password_context.hash(password)


def authenticate_user(username: str, password: str):
    try:
        user = db.get_user(username)
    except:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    return user


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


unauthorized = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid authentication credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def verify_token(token: Annotated[str, Depends(oauth2_scheme)]):
    try:
        is_revoked = db.is_token_revoked(token)
        if is_revoked:
            raise unauthorized

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str | None = cast(str | None, payload.get("sub"))
        if username is None:
            raise unauthorized

        token_data = TokenData(username=username)
    except JWTError:
        raise unauthorized
    return token_data


def verify_invite(invite: Annotated[InviteAccept, Body()]):
    if db.verify_invite(invite.email, invite.invite_key):
        raise unauthorized


async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]):
    token_data = verify_token(token)
    try:
        user = db.get_user(token_data.username)
    except:
        raise unauthorized
    if user is None:
        raise unauthorized
    return user


forbidden = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Forbidden",
)


class has_permission:
    def __init__(self, permission: str):
        self.permission = permission

    def __call__(self, token: Annotated[str, Depends(oauth2_scheme)]):
        token_data = verify_token(token)
        if not db.user_has_permission(token_data.username, self.permission):
            raise forbidden
        return True
