import { setTimeout } from "node:timers/promises"

import {
  type BookMetadataCandidate,
  COVER_PROVIDERS,
  type BookMetadataSearchResult,
  type CoverCandidate,
  type CoverDownloadQuery,
  type CoverSearchQuery,
  type DownloadResult,
  type MetadataBookQuery,
  type MetadataSearchQuery,
  StorytellerNodeKit,
} from "@storyteller-platform/nodekit"

import { readHardcoverToken } from "@/database/providerTokens"
import { logger } from "@/logging"

const HARDCOVER_INTERVAL_MS = 1000

function queriesHardcover(query: {
  provider?: string | undefined
  providers?: readonly string[] | undefined
}): boolean {
  if (query.provider) return query.provider === "hardcover"
  return !query.providers || query.providers.includes("hardcover")
}

export class ProviderError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = "ProviderError"
  }
}

export class NodeKitService {
  #node: StorytellerNodeKit | null = null
  #loadFailureLogged = false
  #configuredToken: string | null | undefined = undefined
  #pending: Promise<unknown> = Promise.resolve()
  #lastHardcoverCall = 0

  available(): boolean {
    try {
      this.#ensureNode()
      return true
    } catch (error) {
      if (!this.#loadFailureLogged) {
        this.#loadFailureLogged = true
        logger.warn({
          err: error,
          msg: "The nodekit addon could not be loaded, metadata import is unavailable",
        })
      }
      return false
    }
  }

  #ensureNode(): StorytellerNodeKit {
    this.#node ??= new StorytellerNodeKit()
    return this.#node
  }

  invalidateTokens() {
    this.#configuredToken = undefined
  }

  async #ready(): Promise<StorytellerNodeKit> {
    const node = this.#ensureNode()
    const { token } = await readHardcoverToken()

    if (token !== this.#configuredToken) {
      await node.configure({ tokens: token ? { hardcover: token } : {} })
      this.#configuredToken = token
    }

    return node
  }

  #enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = this.#pending.then(action, action)
    this.#pending = next.catch(() => {})
    return next
  }

  async #paceHardcover() {
    const wait = this.#lastHardcoverCall + HARDCOVER_INTERVAL_MS - Date.now()
    if (wait > 0) await setTimeout(wait)
    this.#lastHardcoverCall = Date.now()
  }

  #call<T>(
    run: (node: StorytellerNodeKit) => Promise<T>,
    hitsHardcover: boolean,
  ): Promise<T> {
    return this.#enqueue(async () => {
      const node = await this.#ready()
      if (hitsHardcover) await this.#paceHardcover()
      try {
        return await run(node)
      } catch (error) {
        throw new ProviderError(error)
      }
    })
  }

  metadataSearch(
    query: MetadataSearchQuery,
  ): Promise<BookMetadataSearchResult[]> {
    return this.#call(
      (node) => node.metadataSearch(query),
      queriesHardcover(query),
    )
  }

  metadataBook(query: MetadataBookQuery): Promise<BookMetadataCandidate> {
    return this.#call(
      (node) => node.metadataBook(query),
      query.provider === "hardcover",
    )
  }

  metadataBookRaw(query: MetadataBookQuery): Promise<string> {
    return this.#call(
      (node) => node.metadataBookRaw(query),
      query.provider === "hardcover",
    )
  }

  async coverSearch(query: CoverSearchQuery): Promise<CoverCandidate[]> {
    if (query.provider) {
      return this.#call(
        (node) => node.coverSearch(query),
        queriesHardcover(query),
      )
    }

    const { providers = COVER_PROVIDERS, ...search } = query
    const settled = await Promise.allSettled(
      providers.map((provider) =>
        this.#call(
          (node) => node.coverSearch({ ...search, provider }),
          provider === "hardcover",
        ),
      ),
    )
    const found = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    )
    if (!found.length) {
      const failure = settled.find((result) => result.status === "rejected")
      throw failure?.reason ?? new ProviderError("No cover providers")
    }
    return found.flat()
  }

  download(query: CoverDownloadQuery): Promise<DownloadResult> {
    return this.#call(
      (node) => node.download(query),
      query.provider === "hardcover",
    )
  }

  verifyHardcoverToken(token: string): Promise<boolean> {
    return this.#enqueue(async () => {
      const node = this.#ensureNode()
      this.#configuredToken = undefined
      try {
        await node.configure({ tokens: { hardcover: token } })
        await node.metadataSearch({ provider: "hardcover", title: "dune" })
        return true
      } catch (error) {
        if (error instanceof Error && error.message === "unauthorized") {
          return false
        }
        throw new ProviderError(error)
      }
    })
  }
}

declare global {
  var nodekitService: NodeKitService | undefined
}

export function getNodeKit(): NodeKitService {
  globalThis.nodekitService ??= new NodeKitService()
  return globalThis.nodekitService
}
