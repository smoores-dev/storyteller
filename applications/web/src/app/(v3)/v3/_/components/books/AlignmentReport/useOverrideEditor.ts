"use client"

import { useCallback } from "react"

import {
  type AlignmentAudioOverride,
  type AlignmentChapterOverride,
  type BookAlignmentReportView,
  type Judgment,
} from "@/alignmentReportView"
import { useUpdateBookAlignmentOverridesMutation } from "@/store/api"

export type OverrideChange = {
  judgments?: Record<string, Judgment | null>
  audio?: Record<string, boolean>
}

export function useOverrideEditor(view: BookAlignmentReportView) {
  const [update] = useUpdateBookAlignmentOverridesMutation()

  return useCallback(
    (change: OverrideChange) => {
      const chapters: Record<string, AlignmentChapterOverride> = {}
      const audioFiles: Record<string, AlignmentAudioOverride> = {}

      for (const item of view.items) {
        const judgment =
          change.judgments && item.href in change.judgments
            ? change.judgments[item.href]
            : item.judgment
        if (!judgment) continue
        chapters[item.href] = { judgment }
      }

      for (const track of view.tracks) {
        const excluded =
          change.audio && track.name in change.audio
            ? change.audio[track.name]
            : track.excluded
        if (excluded) audioFiles[track.name] = { excluded: true }
      }

      void update({
        uuid: view.bookUuid,
        overrides: { chapters, audioFiles },
      })
    },
    [view, update],
  )
}

export type OverrideEditor = ReturnType<typeof useOverrideEditor>
