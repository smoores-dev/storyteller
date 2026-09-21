"use client"

import { useMemo } from "react"

import { type BookAlignmentReportView } from "@/alignmentReportView"

import { type Track } from "./shared"

export function useTracks(view: Pick<BookAlignmentReportView, "tracks">): {
  tracks: Track[]
  totalSeconds: number
} {
  return useMemo(() => {
    const merged: Track[] = []
    let offset = 0
    for (const track of view.tracks) {
      const duration =
        track.duration > 0
          ? track.duration
          : track.source
            ? track.source.end - track.source.start
            : 0
      merged.push({ ...track, duration, offset })
      offset += duration
    }
    return { tracks: merged, totalSeconds: offset }
  }, [view.tracks])
}
