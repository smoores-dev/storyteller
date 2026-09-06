"use client"

import { useCallback } from "react"

import {
  type BookAlignmentReportView,
  type Judgment,
} from "@/alignmentReportView"
import {
  type AlignmentAudioOverride,
  type AlignmentChapterOverride,
} from "@/database/alignmentReports"
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
      const unalignedChapters: Record<string, AlignmentChapterOverride> = {}
      const audioFiles: Record<string, AlignmentAudioOverride> = {}

      for (const item of view.items) {
        const judgment =
          change.judgments && item.href in change.judgments
            ? change.judgments[item.href]
            : item.judgment
        if (!judgment) continue
        const target = item.kind === "chapter" ? chapters : unalignedChapters
        target[item.href] = { judgment }
      }

      for (const file of view.audioFiles) {
        const excluded =
          change.audio && file.name in change.audio
            ? change.audio[file.name]
            : file.excluded
        if (excluded) audioFiles[file.name] = { excluded: true }
      }

      void update({
        uuid: view.bookUuid,
        overrides: { chapters, unalignedChapters, audioFiles },
      })
    },
    [view, update],
  )
}

export type OverrideEditor = ReturnType<typeof useOverrideEditor>
