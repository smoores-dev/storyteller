import React, {
  type ComponentType,
  type ImgHTMLAttributes,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import type { GitLabClient } from "../gitlab/client"
import { base64ToBlob } from "../images/naming"
import type { ChangesetData } from "../model/changeset"

export const ASSET_SCHEME = "studio-asset:"

export interface AssetResolver {
  resolve: (repoPath: string) => Promise<string | null>
  version: number
}

const AssetContext = createContext<AssetResolver>({
  resolve: () => Promise.resolve(null),
  version: 0,
})

const remoteAssetCache = new Map<string, Promise<string | null>>()

export function invalidateRemoteAssets() {
  for (const pending of remoteAssetCache.values()) {
    pending.then((url) => url && URL.revokeObjectURL(url)).catch(() => null)
  }
  remoteAssetCache.clear()
}

export function useAssetResolver(
  client: GitLabClient,
  projectId: number | null,
  branch: string,
  draft: ChangesetData | null,
): AssetResolver {
  const [draftUrls, setDraftUrls] = useState<Map<string, string>>(new Map())
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const next = new Map<string, string>()
    for (const [path, change] of Object.entries(draft?.changes ?? {})) {
      if (change.kind !== "binary") continue
      next.set(
        path,
        URL.createObjectURL(base64ToBlob(change.base64, change.mime)),
      )
    }
    setDraftUrls(next)
    setVersion((v) => v + 1)
    return () => {
      for (const url of next.values()) URL.revokeObjectURL(url)
    }
  }, [draft])
  return useMemo(
    () => ({
      version,
      resolve: (requested: string) => {
        const local = draftUrls.get(requested)
        if (local) return Promise.resolve(local)
        const change = draft?.changes[requested]
        if (change?.kind === "delete") return Promise.resolve(null)
        const repoPath = change?.kind === "move" ? change.from : requested
        if (projectId === null) return Promise.resolve(null)
        const key = `${projectId}:${branch}:${repoPath}`
        let pending = remoteAssetCache.get(key)
        if (pending === undefined) {
          pending = client
            .getRawBlob(projectId, branch, repoPath)
            .then((blob) => URL.createObjectURL(blob))
            .catch(() => null)
          remoteAssetCache.set(key, pending)
        }
        return pending
      },
    }),
    [client, projectId, branch, draft, draftUrls, version],
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
