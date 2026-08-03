"use client"

import Uppy, { type Meta, type UppyFile } from "@uppy/core"
import useUppyEvent from "@uppy/react/lib/useUppyEvent"
import useUppyState from "@uppy/react/lib/useUppyState"
import Tus from "@uppy/tus"
import { useMemo, useState } from "react"

import { useGetMaxUploadChunkSizeQuery } from "@/store/api"

export type UppyFileType = UppyFile<Meta, Record<string, unknown>>

type Restrictions = {
  maxNumberOfFiles?: number | null
  allowedFileTypes?: string[] | null
}

// Shared Uppy + Tus resumable-upload setup. The replace/add-file dialogs and
// the (future) normal book-upload flow both build on this so the upload
// mechanics live in one place instead of being copy-pasted per modal.
export function useTusUpload({
  endpoint,
  restrictions,
  buildMeta,
  configureUppy,
}: {
  endpoint: string
  restrictions?: Restrictions
  // attach per-file metadata immediately before upload starts. the whole batch
  // comes along so a file can describe its siblings (how many audio files the
  // server should wait for before scanning).
  buildMeta?: (file: UppyFileType, files: UppyFileType[]) => void
  // register extra plugins (e.g. thumbnail generation) on the instance
  configureUppy?: (uppy: Uppy) => void
}) {
  const { data } = useGetMaxUploadChunkSizeQuery()
  const maxUploadChunkSize = data?.maxUploadChunkSize

  const [isComplete, setIsComplete] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [failedCount, setFailedCount] = useState(0)

  // create the instance once; the chunk size (which loads async) is applied at
  // upload time via the Tus plugin, so we never need to recreate the instance
  const [uppy] = useState(() => {
    const instance = new Uppy({ restrictions }).use(Tus, {
      endpoint,
      withCredentials: true,
    })
    configureUppy?.(instance)
    return instance
  })

  useUppyEvent(uppy, "complete", (result) => {
    setIsComplete(true)
    setIsUploading(false)
    setFailedCount(result.failed?.length ?? 0)
  })

  useUppyEvent(uppy, "error", () => {
    setIsUploading(false)
  })

  const filesRecord = useUppyState(uppy, (state) => state.files)
  const files = useMemo(() => Object.values(filesRecord), [filesRecord])

  function reset() {
    uppy.clear()
    setIsComplete(false)
    setIsUploading(false)
    setFailedCount(0)
  }

  function startUpload() {
    if (maxUploadChunkSize) {
      uppy.getPlugin("Tus")?.setOptions({ chunkSize: maxUploadChunkSize })
    }
    const batch = uppy.getFiles()
    if (buildMeta) {
      batch.forEach((file) => {
        buildMeta(file, batch)
      })
    }
    setIsUploading(true)
    uppy.upload().catch((e: unknown) => {
      console.error(e)
      setIsUploading(false)
    })
  }

  return {
    uppy,
    files,
    isComplete,
    isUploading,
    failedCount,
    reset,
    startUpload,
  }
}
