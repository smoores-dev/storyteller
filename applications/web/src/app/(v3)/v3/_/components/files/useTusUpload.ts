"use client"

import Uppy, { type Meta, type UppyFile } from "@uppy/core"
import useUppyEvent from "@uppy/react/lib/useUppyEvent"
import useUppyState from "@uppy/react/lib/useUppyState"
import Tus from "@uppy/tus"
import { useEffect, useMemo, useState } from "react"

import { useGetMaxUploadChunkSizeQuery } from "@/store/api"

export type UppyFileType = UppyFile<Meta, Record<string, unknown>>

type Restrictions = {
  maxNumberOfFiles?: number | null
  allowedFileTypes?: string[] | null
}

export function addFilesToUppy(uppy: Uppy, files: Iterable<File>) {
  for (const file of files) {
    try {
      uppy.addFile({ name: file.name, type: file.type, data: file })
    } catch (e) {
      console.error(e)
    }
  }
}

export function useTusUpload({
  endpoint,
  restrictions,
  buildMeta,
  configureUppy,
}: {
  endpoint: string
  restrictions?: Restrictions
  buildMeta?: (file: UppyFileType, files: UppyFileType[]) => void
  configureUppy?: (uppy: Uppy) => void
}) {
  const { data } = useGetMaxUploadChunkSizeQuery()
  const maxUploadChunkSize = data?.maxUploadChunkSize

  const [isComplete, setIsComplete] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [failedCount, setFailedCount] = useState(0)

  const [uppy] = useState(() => {
    const instance = new Uppy({ restrictions }).use(Tus, {
      endpoint,
      withCredentials: true,
    })
    configureUppy?.(instance)
    return instance
  })

  const maxNumberOfFiles = restrictions?.maxNumberOfFiles ?? null
  const allowedFileTypes = restrictions?.allowedFileTypes?.join("\n")
  useEffect(() => {
    uppy.setOptions({
      restrictions: {
        maxNumberOfFiles,
        allowedFileTypes: allowedFileTypes?.split("\n") ?? null,
      },
    })
  }, [uppy, maxNumberOfFiles, allowedFileTypes])

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
