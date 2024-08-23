import { join } from "node:path"

export const DATA_DIR = process.env["STORYTELLER_DATA_DIR"] ?? "."

export const AUDIO_DIR = join(DATA_DIR, "assets", "audio")

export const TEXT_DIR = join(DATA_DIR, "assets", "text")

export const IMAGE_DIR = join(DATA_DIR, "assets", "images")

export const CACHE_DIR = join(DATA_DIR, "cache")

export const WHISPER_BUILD_DIR = join(process.cwd(), "whisper-builds")
