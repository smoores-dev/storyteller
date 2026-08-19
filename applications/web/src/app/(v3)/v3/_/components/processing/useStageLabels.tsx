"use client"

import { useTranslation } from "@v3/_/hooks/use-translation"

import { type Stage } from "./shared"

export function useStageLabels(): Record<Stage, string> {
  const t = useTranslation("Processing")
  return {
    SPLIT_TRACKS: t("stage.SPLIT_TRACKS"),
    TRANSCRIBE_CHAPTERS: t("stage.TRANSCRIBE_CHAPTERS"),
    SYNC_CHAPTERS: t("stage.SYNC_CHAPTERS"),
  }
}
