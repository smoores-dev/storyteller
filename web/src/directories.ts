import { join } from "node:path"

import { env } from "@/env"

export const DATA_DIR = env.STORYTELLER_DATA_DIR

export const DB_DIR = env.STORYTELLER_DB_DIR || DATA_DIR

export const ASSETS_DIR = join(DATA_DIR, "assets")

export const UPLOADS_DIR = join(DATA_DIR, "uploads")

export const AUDIO_DIR = join(ASSETS_DIR, "audio")

export const TEXT_DIR = join(ASSETS_DIR, "text")

export const IMAGE_CACHE_DIR = join(DATA_DIR, "image-cache")

export const CACHE_DIR = join(DATA_DIR, "cache")

export const WHISPER_BUILD_DIR = join(process.cwd(), "whisper-builds")
