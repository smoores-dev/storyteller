from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    allowed_origins: str = Field(default="")
    batch_size: int = Field(default=16)
    compute_type: str = Field(default="int8")
    debug_requests: bool = Field(default=False)
    device: str = Field(default="cpu")
    root_path: str = Field(default="")

    model_config = SettingsConfigDict(env_file=".env.local", env_prefix="storyteller_")


config = Settings()
