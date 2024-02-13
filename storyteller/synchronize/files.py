import os
from typing import TypeAlias


DATA_DIR = os.getenv("STORYTELLER_DATA_DIR", ".")


AUDIO_DIR = f"{DATA_DIR}/assets/audio"


TEXT_DIR = f"{DATA_DIR}/assets/text"


CACHE_DIR = f"{DATA_DIR}/cache"


StrPath: TypeAlias = str | os.PathLike[str]  # stable
