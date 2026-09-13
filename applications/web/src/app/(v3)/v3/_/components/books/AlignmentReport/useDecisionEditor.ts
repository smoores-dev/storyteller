"use client"

import { useCallback } from "react"

import {
  type AudioExclusion,
  type BookAlignmentReportView,
  type Judgment,
} from "@/alignmentReportView"
import { useUpdateBookAlignmentDecisionsMutation } from "@/store/api"

export type DecisionChange = {
  judgments?: Record<string, Judgment | null>
  tracks?: Record<string, boolean>
  excludeRanges?: AudioExclusion[]
  restoreRanges?: AudioExclusion[]
}

function covers(outer: AudioExclusion, inner: AudioExclusion): boolean {
  if (outer.track !== inner.track) return false
  const outerStart = outer.start ?? Number.NEGATIVE_INFINITY
  const outerEnd = outer.end ?? Number.POSITIVE_INFINITY
  const innerStart = inner.start ?? Number.NEGATIVE_INFINITY
  const innerEnd = inner.end ?? Number.POSITIVE_INFINITY
  return outerStart <= innerStart && outerEnd >= innerEnd
}

export function useDecisionEditor(view: BookAlignmentReportView) {
  const [update] = useUpdateBookAlignmentDecisionsMutation()

  return useCallback(
    (change: DecisionChange) => {
      const chapters = new Map(Object.entries(view.decisions.chapters))
      for (const [href, judgment] of Object.entries(change.judgments ?? {})) {
        if (judgment) chapters.set(href, judgment)
        else chapters.delete(href)
      }

      let audio = [...view.decisions.audio]
      for (const [track, excluded] of Object.entries(change.tracks ?? {})) {
        audio = audio.filter((exclusion) => exclusion.track !== track)
        if (excluded) audio.push({ track, start: null, end: null })
      }
      for (const range of change.restoreRanges ?? []) {
        audio = audio.filter((exclusion) => !covers(exclusion, range))
      }
      audio.push(...(change.excludeRanges ?? []))

      void update({
        uuid: view.bookUuid,
        decisions: { chapters: Object.fromEntries(chapters), audio },
      })
    },
    [view, update],
  )
}

export type DecisionEditor = ReturnType<typeof useDecisionEditor>
