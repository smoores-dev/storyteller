"use client"

import { useEffect, useState } from "react"

import { type EpubPreview, isEpubFile, readEpubPreview } from "@/epub"

export type EpubPreviewWithCoverUrl = Omit<EpubPreview, "cover"> & {
  coverUrl: string | null
}

export function useEpubPreview(
  name: string,
  data: Blob | undefined,
): EpubPreviewWithCoverUrl | null {
  const [state, setState] = useState<{
    data: Blob
    preview: EpubPreviewWithCoverUrl
  } | null>(null)

  const isEpub = isEpubFile(name)

  useEffect(() => {
    if (!data || !isEpub) return

    let cancelled = false
    let coverUrl: string | null = null
    readEpubPreview(data).then(
      ({ cover, ...preview }) => {
        if (cancelled) return
        coverUrl = cover && URL.createObjectURL(cover)
        setState({ data, preview: { ...preview, coverUrl } })
      },
      (error: unknown) => {
        console.error(error)
      },
    )

    return () => {
      cancelled = true
      if (coverUrl) URL.revokeObjectURL(coverUrl)
    }
  }, [data, isEpub])

  return state && state.data === data ? state.preview : null
}
