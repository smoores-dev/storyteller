import { join } from "node:path"

import { env } from "./env"

export const DATA_DIR = env.STORYTELLER_DATA_DIR

export const DB_DIR = env.STORYTELLER_DB_DIR || DATA_DIR

export const SNAPSHOT_DIR =
  env.STORYTELLER_SNAPSHOT_DIR ||
  join(DATA_DIR, ".autoimport", "watcher-snapshots")

export const ASSETS_DIR = env.STORYTELLER_ASSETS_DIR || join(DATA_DIR, "assets")

export const SCRATCH_DIR = env.STORYTELLER_SCRATCH_DIR || join(DATA_DIR, "tmp")

export const UPLOADS_DIR = join(DATA_DIR, "uploads")

export const AUDIO_DIR = join(ASSETS_DIR, "audio")

export const TEXT_DIR = join(ASSETS_DIR, "text")

export const IMAGES_DIR = join(DATA_DIR, "images")

export const IMAGE_CACHE_DIR = join(DATA_DIR, "image-cache")

export const CACHE_DIR = join(DATA_DIR, "cache")

export const BACKUP_DIR = join(DATA_DIR, "backups")

export const LOG_DIR = join(DATA_DIR, "logs")
