import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, parse, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import type {
  BookMetadataCandidate,
  BookMetadataSearchResult,
  ConfigureOptions,
  CoverCandidate,
  CoverDownloadQuery,
  CoverSearchQuery,
  DownloadResult,
  MetadataBookQuery,
  MetadataSearchQuery,
} from "./types.ts"

export type NodeKitRaw = {
  configure(options: string): Promise<void>
  metadataSearch(options: string): Promise<string>
  metadataBook(options: string): Promise<string>
  metadataBookRaw(options: string): Promise<string>
  coverSearch(options: string): Promise<string>
  download(options: string): Promise<DownloadResult>
}

export class NodeKitLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "NodeKitLoadError"
  }
}

const moduleFile =
  typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url)

const moduleFileIsReal = existsSync(moduleFile)

const packageDir = moduleFileIsReal ? resolve(dirname(moduleFile), "..") : null

const requireBases = [
  ...(moduleFileIsReal ? [moduleFile] : []),
  resolve(process.cwd(), "noop.js"),
]

const requires = requireBases.map((base) => createRequire(base))

export const ADDON_SOURCES = ["local", "npm"] as const

export type AddonSource = (typeof ADDON_SOURCES)[number]

export type AddonCandidate = {
  source: AddonSource
  path: string
  exists: boolean
}

export type AddonResolution = {
  platform: string
  supported: boolean
  override: string | null
  sources: AddonSource[]
  candidates: AddonCandidate[]
  resolved: string | null
}

const PLATFORM_VARIANTS: Record<string, { file: string; package: string }> = {
  "darwin-arm64": {
    file: "nodekit.darwin-arm64.node",
    package: "@storyteller-platform/nodekit-darwin-arm64",
  },
  "darwin-x64": {
    file: "nodekit.darwin-x64.node",
    package: "@storyteller-platform/nodekit-darwin-x64",
  },
  "linux-x64": {
    file: "nodekit.linux-x64-gnu.node",
    package: "@storyteller-platform/nodekit-linux-x64-gnu",
  },
  "linux-arm64": {
    file: "nodekit.linux-arm64-gnu.node",
    package: "@storyteller-platform/nodekit-linux-arm64-gnu",
  },
  "win32-x64": {
    file: "nodekit.win32-x64-msvc.node",
    package: "@storyteller-platform/nodekit-win32-x64-msvc",
  },
  "win32-arm64": {
    file: "nodekit.win32-arm64-msvc.node",
    package: "@storyteller-platform/nodekit-win32-arm64-msvc",
  },
}

function ancestorDirs(from: string): string[] {
  const dirs: string[] = []
  const { root } = parse(from)

  let current = from
  let done = false

  while (!done) {
    dirs.push(current)
    const parent = dirname(current)
    done =
      existsSync(resolve(current, ".git")) ||
      current === root ||
      parent === current
    current = parent
  }

  return dirs
}

function requestedSources(): AddonSource[] {
  const requested = process.env["STORYTELLER_NODEKIT_SOURCE"]
  if (!requested || requested === "auto") return [...ADDON_SOURCES]

  if (!ADDON_SOURCES.includes(requested as AddonSource)) {
    throw new NodeKitLoadError(
      `Invalid STORYTELLER_NODEKIT_SOURCE "${requested}", expected one of: ` +
        `${ADDON_SOURCES.join(", ")}, auto`,
    )
  }

  return [requested as AddonSource]
}

function localPaths(file: string): string[] {
  const cwd = process.cwd()

  const paths = [
    ...(packageDir ? [resolve(packageDir, file)] : []),
    resolve(cwd, file),
    resolve(cwd, "StorytellerNodeKit.node"),
  ]

  for (const dir of ancestorDirs(cwd)) {
    paths.push(resolve(dir, "libraries", "nodekit", file))
    paths.push(resolve(dir, ".build", "StorytellerNodeKit.node"))
  }

  return [...new Set(paths)]
}

function npmCandidate(packageName: string): AddonCandidate {
  for (const candidateRequire of requires) {
    try {
      return {
        source: "npm",
        path: candidateRequire.resolve(packageName),
        exists: true,
      }
    } catch {
      continue
    }
  }

  return { source: "npm", path: packageName, exists: false }
}

export function describeAddonResolution(): AddonResolution {
  const platform = `${process.platform}-${process.arch}`
  const override = process.env["STORYTELLER_NODEKIT_PATH"] ?? null
  const sources = requestedSources()
  const variant = PLATFORM_VARIANTS[platform]

  if (override) {
    return {
      platform,
      supported: variant !== undefined,
      override,
      sources,
      candidates: [],
      resolved: override,
    }
  }

  if (!variant) {
    return {
      platform,
      supported: false,
      override,
      sources,
      candidates: [],
      resolved: null,
    }
  }

  const candidates: AddonCandidate[] = []

  for (const source of sources) {
    if (source === "local") {
      for (const path of localPaths(variant.file)) {
        candidates.push({ source, path, exists: existsSync(path) })
      }
    } else {
      candidates.push(npmCandidate(variant.package))
    }
  }

  return {
    platform,
    supported: true,
    override,
    sources,
    candidates,
    resolved: candidates.find((candidate) => candidate.exists)?.path ?? null,
  }
}

export function resolveAddonPath(): string | null {
  return describeAddonResolution().resolved
}

function notFoundMessage(resolution: AddonResolution): string {
  if (!resolution.supported) {
    return (
      `No StorytellerNodeKit build exists for ${resolution.platform}. ` +
      `Set STORYTELLER_NODEKIT_PATH to load an addon anyway.`
    )
  }

  const tried = resolution.candidates
    .map((candidate) => `  [${candidate.source}] ${candidate.path}`)
    .join("\n")

  return (
    `StorytellerNodeKit addon not found for ${resolution.platform} ` +
    `(sources: ${resolution.sources.join(", ")}).\n` +
    `Run 'yarn workspace @storyteller-platform/nodekit build:native', ` +
    `install the platform package, or set STORYTELLER_NODEKIT_PATH.\n` +
    `Tried:\n${tried}`
  )
}

const ADDON_CACHE = Symbol.for("storyteller-platform.nodekit.addon")

type LoadedAddon = { path: string; addon: NodeKitRaw }

type GlobalWithAddon = typeof globalThis & { [ADDON_CACHE]?: LoadedAddon }

export function loadAddon(): NodeKitRaw {
  const resolution = describeAddonResolution()

  if (!resolution.resolved) {
    throw new NodeKitLoadError(notFoundMessage(resolution))
  }

  const store = globalThis as GlobalWithAddon
  const loaded = store[ADDON_CACHE]
  if (loaded && loaded.path === resolution.resolved) return loaded.addon

  try {
    const mod = { exports: {} as NodeKitRaw }
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
    process.dlopen(mod as unknown as NodeJS.Module, resolution.resolved)
    store[ADDON_CACHE] = { path: resolution.resolved, addon: mod.exports }
    return mod.exports
  } catch (error) {
    throw new NodeKitLoadError(
      `Failed to load addon at ${resolution.resolved}`,
      { cause: error },
    )
  }
}

export class StorytellerNodeKit {
  #loaded: NodeKitRaw
  #ready: Promise<void>

  constructor(options?: ConfigureOptions) {
    this.#loaded = loadAddon()
    this.#ready = options ? this.#apply(options) : Promise.resolve()
  }

  #apply(options: ConfigureOptions): Promise<void> {
    const pending = this.#loaded.configure(JSON.stringify(options))
    pending.catch(() => {})
    return pending
  }

  configure(options: ConfigureOptions): Promise<void> {
    this.#ready = this.#apply(options)
    return this.#ready
  }

  async metadataSearch(
    options: MetadataSearchQuery,
  ): Promise<BookMetadataSearchResult[]> {
    await this.#ready
    const result = await this.#loaded.metadataSearch(JSON.stringify(options))

    // hardcover ids arrive as JSON numbers
    const parsed = JSON.parse(result) as (Omit<
      BookMetadataSearchResult,
      "id"
    > & { id: string | number })[]

    return parsed.map((entry) => ({ ...entry, id: String(entry.id) }))
  }

  async metadataBook(
    options: MetadataBookQuery,
  ): Promise<BookMetadataCandidate> {
    type WireEdition = Omit<
      NonNullable<BookMetadataCandidate["editions"]>[number],
      "id"
    > & { id: string | number }

    await this.#ready
    const result = await this.#loaded.metadataBook(JSON.stringify(options))

    const { id, editions, defaultAudioEdition, ...rest } = JSON.parse(
      result,
    ) as Omit<
      BookMetadataCandidate,
      "id" | "editions" | "defaultAudioEdition"
    > & {
      id?: string | number
      editions?: WireEdition[]
      defaultAudioEdition?: WireEdition
    }

    return {
      ...rest,
      ...(id != null && { id: String(id) }),
      ...(editions && {
        editions: editions.map((edition) => ({
          ...edition,
          id: String(edition.id),
        })),
      }),
      ...(defaultAudioEdition && {
        defaultAudioEdition: {
          ...defaultAudioEdition,
          id: String(defaultAudioEdition.id),
        },
      }),
    } as BookMetadataCandidate
  }

  async metadataBookRaw(options: MetadataBookQuery): Promise<string> {
    await this.#ready
    return this.#loaded.metadataBookRaw(JSON.stringify(options))
  }

  async coverSearch(options: CoverSearchQuery): Promise<CoverCandidate[]> {
    await this.#ready
    const result = await this.#loaded.coverSearch(JSON.stringify(options))

    return JSON.parse(result) as CoverCandidate[]
  }

  async download(options: CoverDownloadQuery): Promise<DownloadResult> {
    await this.#ready
    return this.#loaded.download(JSON.stringify(options))
  }
}
