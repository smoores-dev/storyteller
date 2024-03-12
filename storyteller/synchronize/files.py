import os
from pathlib import Path
from typing import TypeAlias


DATA_DIR = os.getenv("STORYTELLER_DATA_DIR", ".")


AUDIO_DIR = Path(DATA_DIR, "assets", "audio")


TEXT_DIR = Path(DATA_DIR, "assets", "text")


IMAGE_DIR = Path(DATA_DIR, "assets", "images")


CACHE_DIR = Path(DATA_DIR, "cache")


StrPath: TypeAlias = str | os.PathLike[str]  # stable
