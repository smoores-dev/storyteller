import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"

import { scratchPath } from "@storyteller-platform/fs"

const PREFIX = "scratch-"

const STALE_AFTER_MS = 24 * 60 * 60 * 1000

const RM_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100,
} as const

export interface ScratchOptions {
  base?: string | undefined
  sweep?: boolean | undefined
}

export class Scratch implements AsyncDisposable {
  private counter = 0
  private disposed: Promise<void> | null = null

  private constructor(readonly path: string) {}

  static async create(options: ScratchOptions = {}): Promise<Scratch> {
    const base = options.base ?? scratchPath("ghost-story")
    await mkdir(base, { recursive: true })
    if (options.sweep ?? true) {
      await sweepScratch(base)
    }
    return new Scratch(await mkdtemp(join(base, `${PREFIX}${process.pid}-`)))
  }

  unique(suffix = ""): string {
    return join(this.path, `${this.counter++}${suffix}`)
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.disposed ??= rm(this.path, RM_OPTIONS)
    return this.disposed
  }
}

export async function sweepScratch(base: string): Promise<void> {
  let names: string[]
  try {
    names = await readdir(base)
  } catch {
    return
  }

  for (const name of names) {
    if (!name.startsWith(PREFIX)) {
      continue
    }
    const pid = Number.parseInt(name.slice(PREFIX.length), 10)
    const path = join(base, name)
    try {
      const { mtimeMs } = await stat(path)
      const abandoned = Date.now() - mtimeMs > STALE_AFTER_MS
      if (abandoned || !isAlive(pid)) {
        await rm(path, RM_OPTIONS)
      }
    } catch {
      continue
    }
  }
}

function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}
