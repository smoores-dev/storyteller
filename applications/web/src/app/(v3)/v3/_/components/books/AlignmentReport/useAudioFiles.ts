"use client"

import { useMemo } from "react"

import { type ReportAudioFile } from "@/alignmentReportView"
import { useGetTranscodedAudioQuery } from "@/store/api"
import { type UUID } from "@/uuid"

export type AudioFile = ReportAudioFile & { present: boolean; offset: number }

export function useAudioFiles(
  bookUuid: UUID,
  files: ReportAudioFile[],
): { files: AudioFile[]; totalSeconds: number } {
  const { data } = useGetTranscodedAudioQuery({ uuid: bookUuid })

  return useMemo(() => {
    const onDisk = new Map((data ?? []).map((file) => [file.name, file]))
    const merged: AudioFile[] = []
    for (const file of files) {
      const disk = onDisk.get(file.name)
      const previous = merged.at(-1)
      merged.push({
        ...file,
        duration: file.duration > 0 ? file.duration : disk?.duration ?? 0,
        present: disk?.present ?? true,
        offset: previous ? previous.offset + previous.duration : 0,
      })
    }
    const last = merged.at(-1)
    return {
      files: merged,
      totalSeconds: last ? last.offset + last.duration : 0,
    }
  }, [files, data])
}
