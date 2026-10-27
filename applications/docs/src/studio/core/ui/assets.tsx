import React, {
  type ComponentType,
  type ImgHTMLAttributes,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import type { GitLabClient } from "../gitlab/client"
import type { ChangesetData } from "../model/changeset"
import { cached } from "../storage/cache"

import { knownBlobId } from "./hooks"

export const ASSET_SCHEME = "studio-asset:"

export interface AssetResolver {
  resolve: (repoPath: string) => Promise<string | null>
  draftUrl: (repoPath: string) => string | null
  version: number
}

const AssetContext = createContext<AssetResolver>({
  resolve: () => Promise.resolve(null),
  draftUrl: () => null,
  version: 0,
})

const remoteAssetCache = new Map<string, Promise<string | null>>()

export function invalidateRemoteAssets() {
  for (const pending of remoteAssetCache.values()) {
    pending.then((url) => url && URL.revokeObjectURL(url)).catch(() => null)
  }
  remoteAssetCache.clear()
}

const REVOKE_DELAY_MS = 10_000

function retire(url: string) {
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

function structureOf(draft: ChangesetData | null): string {
  return Object.entries(draft?.changes ?? {})
    .filter(([, change]) => change.kind !== "text")
    .map(([path, change]) =>
      change.kind === "move"
        ? `${path}<${change.from}`
        : `${path}:${change.kind}`,
    )
    .sort()
    .join("\n")
}

export function useAssetResolver(
  client: GitLabClient,
  projectId: number | null,
  branch: string,
  draft: ChangesetData | null,
): AssetResolver {
  const urls = useRef(new Map<string, { blob: Blob; url: string }>())
  const structure = useRef("")
  const latest = useRef(draft)
  latest.current = draft
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const map = urls.current
    let changed = false
    const live = new Set<string>()
    for (const [path, change] of Object.entries(draft?.changes ?? {})) {
      if (change.kind !== "binary") continue
      live.add(path)
      const existing = map.get(path)
      if (existing?.blob === change.blob) continue
      if (existing) retire(existing.url)
      map.set(path, {
        blob: change.blob,
        url: URL.createObjectURL(change.blob),
      })
      changed = true
    }
    for (const [path, entry] of [...map]) {
      if (live.has(path)) continue
      retire(entry.url)
      map.delete(path)
      changed = true
    }
    const next = structureOf(draft)
    if (next !== structure.current) {
      structure.current = next
      changed = true
    }
    if (changed) setVersion((current) => current + 1)
  }, [draft])
  useEffect(() => {
    const map = urls.current
    return () => {
      for (const entry of map.values()) URL.revokeObjectURL(entry.url)
      map.clear()
    }
  }, [])
  return useMemo(
    () => ({
      version,
      draftUrl: (requested: string) => urls.current.get(requested)?.url ?? null,
      resolve: (requested: string) => {
        const local = urls.current.get(requested)?.url
        if (local) return Promise.resolve(local)
        const change = latest.current?.changes[requested]
        if (change?.kind === "delete") return Promise.resolve(null)
        const repoPath = change?.kind === "move" ? change.from : requested
        if (projectId === null) return Promise.resolve(null)
        const key = `${projectId}:${branch}:${repoPath}`
        let pending = remoteAssetCache.get(key)
        if (pending === undefined) {
          const blobId = knownBlobId(projectId, branch, repoPath)
          pending = cached<Blob>(
            blobId ? `asset:${projectId}:${blobId}` : null,
            () => client.getRawBlob(projectId, branch, repoPath),
          )
            .then((blob) => URL.createObjectURL(blob))
            .catch(() => {
              remoteAssetCache.delete(key)
              return null
            })
          remoteAssetCache.set(key, pending)
        }
        return pending
      },
    }),
    [client, projectId, branch, version],
  )
}

export function AssetProvider({
  resolver,
  children,
}: {
  resolver: AssetResolver
  children: ReactNode
}) {
  return (
    <AssetContext.Provider value={resolver}>{children}</AssetContext.Provider>
  )
}

export function useResolvedAsset(src: string | undefined): string | undefined {
  const resolver = useContext(AssetContext)
  const isStudio = typeof src === "string" && src.startsWith(ASSET_SCHEME)
  const [resolved, setResolved] = useState<string | undefined>(
    isStudio ? undefined : src,
  )
  useEffect(() => {
    if (!isStudio || !src) {
      setResolved(src)
      return
    }
    let cancelled = false
    resolver.resolve(src.slice(ASSET_SCHEME.length)).then((url) => {
      if (!cancelled) setResolved(url ?? undefined)
    })
    return () => {
      cancelled = true
    }
  }, [src, isStudio, resolver])
  return resolved
}

export function withAssetResolution(
  Img: ComponentType<ImgHTMLAttributes<HTMLImageElement>> | "img",
) {
  /* eslint-disable react/prop-types */
  return function StudioImg(props: ImgHTMLAttributes<HTMLImageElement>) {
    const src = useResolvedAsset(props.src)
    if (props.src?.startsWith(ASSET_SCHEME) && !src) {
      return (
        <span className="studio-missing-image">{props.alt ?? "image"}</span>
      )
    }
    return <Img {...props} src={src} />
  }
  /* eslint-enable react/prop-types */
}
