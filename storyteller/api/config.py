from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    allowed_origins: str = Field(default="")
    debug_requests: bool = Field(default=False)

    model_config = SettingsConfigDict(env_file=".env.local", env_prefix="storyteller_")
