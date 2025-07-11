import { join } from "node:path"

export const DATA_DIR = process.env["STORYTELLER_DATA_DIR"] ?? "."

export const ASSETS_DIR = join(DATA_DIR, "assets")

export const UPLOADS_DIR = join(DATA_DIR, "uploads")

export const AUDIO_DIR = join(ASSETS_DIR, "audio")

export const TEXT_DIR = join(ASSETS_DIR, "text")

export const IMAGE_DIR = join(ASSETS_DIR, "images")

export const CACHE_DIR = join(DATA_DIR, "cache")

export const WHISPER_BUILD_DIR = join(process.cwd(), "whisper-builds")
