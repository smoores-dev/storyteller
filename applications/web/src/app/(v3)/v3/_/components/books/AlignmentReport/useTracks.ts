"use client"

import { useMemo } from "react"

import { type ViewTrack } from "@/alignmentReportView"
import { useGetTranscodedAudioQuery } from "@/store/api"
import { type UUID } from "@/uuid"

import { type Track } from "./shared"

export function useTracks(
  bookUuid: UUID,
  tracks: ViewTrack[],
): { tracks: Track[]; totalSeconds: number } {
  const { data } = useGetTranscodedAudioQuery({ uuid: bookUuid })

  return useMemo(() => {
    const onDisk = new Map((data ?? []).map((file) => [file.name, file]))
    const merged: Track[] = []
    let offset = 0
    for (const track of tracks) {
      const disk = onDisk.get(track.name)
      const duration =
        track.duration > 0 ? track.duration : (disk?.duration ?? 0)
      merged.push({
        ...track,
        duration,
        offset,
        present: disk?.present ?? true,
      })
      offset += duration
    }
    return { tracks: merged, totalSeconds: offset }
  }, [tracks, data])
}
