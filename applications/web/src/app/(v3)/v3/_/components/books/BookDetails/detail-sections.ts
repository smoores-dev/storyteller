"use client"

import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectDetailSectionOrder,
  selectHiddenDetailSections,
  uiSettingsSlice,
} from "@/store/slices/uiSettingsSlice"

export const DETAIL_SECTION_KEYS = [
  "review",
  "description",
  "details",
  "tags",
  "collections",
  "contributors",
  "moreByAuthor",
  "moreInSeries",
  "alignment",
  "files",
] as const

export type DetailSectionKey = (typeof DETAIL_SECTION_KEYS)[number]

const isKnownKey = (key: string): key is DetailSectionKey =>
  (DETAIL_SECTION_KEYS as readonly string[]).includes(key)

export function resolveDetailSectionOrder(
  stored: string[] | null,
): DetailSectionKey[] {
  if (!stored) return [...DETAIL_SECTION_KEYS]

  const known = stored.filter(isKnownKey)

  return [
    ...known,
    ...DETAIL_SECTION_KEYS.filter((key) => !known.includes(key)),
  ]
}

export function useDetailSections() {
  const dispatch = useAppDispatch()
  const storedOrder = useAppSelector(selectDetailSectionOrder)
  const storedHidden = useAppSelector(selectHiddenDetailSections)

  const order = resolveDetailSectionOrder(storedOrder)
  const hidden = storedHidden.filter(isKnownKey)
  const visible = order.filter((key) => !hidden.includes(key))

  const setSections = (next: {
    order: DetailSectionKey[]
    hidden: DetailSectionKey[]
  }) => {
    dispatch(
      uiSettingsSlice.actions.setDetailSections({
        order: [...next.order],
        hidden: [...next.hidden],
      }),
    )
  }

  const reset = () => {
    dispatch(
      uiSettingsSlice.actions.setDetailSections({ order: null, hidden: [] }),
    )
  }

  const isCustomized = storedOrder !== null || hidden.length > 0

  return { order, hidden, visible, setSections, reset, isCustomized }
}

export function useDetailSectionLabels(): Record<DetailSectionKey, string> {
  const t = useTranslation("BookDetailsPage")
  const tLabels = useTranslation("Labels")
  const tAlignment = useTranslation("BookDetailsPage.alignment")
  const c = useCommon()

  return {
    review: t.plain("review.title"),
    description: c.plain("fields.label.description"),
    details: tLabels.plain("bookDetails"),
    tags: c.plain("fields.label.tags"),
    collections: c.plain("fields.label.collections"),
    contributors: tLabels.plain("otherContributors"),
    moreByAuthor: t.plain("customize.moreByAuthor"),
    moreInSeries: t.plain("customize.moreInSeries"),
    alignment: tAlignment.plain("title"),
    files: t.plain("fileInformation.title"),
  }
}
