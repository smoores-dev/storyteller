"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useBookForm } from "@v3/_/components/books/BookDetails/BookFormProvider"
import { MultidimensionalRating } from "@v3/_/components/books/BookDetails/sections/MultidimensionalRating"
import { RatingInput } from "@v3/_/components/books/RatingInput"
import { Button } from "@v3/_/components/ui/button"
import { Field, FieldLabel } from "@v3/_/components/ui/field"
import { Textarea } from "@v3/_/components/ui/textarea"
import { useUserPreferences } from "@v3/_/components/user-preferences-provider"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { SEAMLESS_BOX } from "@/app/(v3)/v3/_/components/books/BookDetails/EditableText"
import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import {
  type RatingDimensionScores,
  computeRatingAverage,
  formatRating,
} from "@/database/ratingDimensions"
import * as icon from "@/icons"
import {
  useDeleteUserBookRatingMutation,
  useSetUserBookRatingMutation,
} from "@/store/api"

import { CollapsibleSection } from "./CollapsibleSection"

function InlineRatingNumber({
  value,
  placeholder,
  onCommit,
}: {
  value: number | null
  placeholder: string
  onCommit: (value: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState("")
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [editing])

  const commit = () => {
    setEditing(false)
    const trimmed = text.trim()
    if (trimmed === "") {
      onCommit(null)
      return
    }
    const num = Number(trimmed)
    if (Number.isNaN(num)) return
    const clamped = Math.min(5, Math.max(0, num))
    onCommit(Math.round(clamped * 100) / 100)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setText(value != null ? formatRating(value) : "")
          setEditing(true)
        }}
        className={cn(
          SEAMLESS_BOX,
          "hover:border-input hover:bg-input/10 w-12 cursor-text border-transparent text-sm tabular-nums",
          value == null && "text-muted-foreground italic",
        )}
      >
        {value != null ? formatRating(value) : placeholder}
      </button>
    )
  }

  return (
    <input
      ref={ref}
      type="number"
      inputMode="decimal"
      min={0}
      max={5}
      step={0.01}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
        }
        if (e.key === "Escape") {
          e.preventDefault()
          e.stopPropagation()
          setEditing(false)
        }
      }}
      className={cn(
        SEAMLESS_BOX,
        "border-input bg-input/20 dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/30 w-14 text-sm tabular-nums outline-none focus-visible:ring-2",
      )}
    />
  )
}

export function ReviewSection({ className }: { className?: string }) {
  const { book } = useBookForm()
  const t = useTranslation("BookDetailsPage")
  const c = useCommon()
  const { ratingDimensions } = useUserPreferences()

  const [setUserBookRating, { isLoading: isSaving }] =
    useSetUserBookRatingMutation()
  const [deleteUserBookRating] = useDeleteUserBookRatingMutation()

  const currentRating = book.userBookRating?.rating ?? null
  const currentReview = book.userBookRating?.review ?? ""
  const currentDimensions = book.userBookRating?.dimensions ?? null
  const hasDimensions =
    !!currentDimensions && Object.keys(currentDimensions).length > 0

  const ratingColor = "var(--cover-accent)"

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  const startEdit = () => {
    setDraft(currentReview)
    setEditing(true)
  }

  const applyManualRating = (value: number | null) => {
    if (value == null && !currentReview) {
      void deleteUserBookRating({ bookUuid: book.uuid })
      return
    }
    void setUserBookRating({
      bookUuid: book.uuid,
      rating: value,
      review: currentReview || null,
      dimensions: null,
    })
  }

  const addAdvancedRating = () => {
    const base =
      Math.round(Math.min(5, Math.max(0, currentRating ?? 0)) * 2) / 2
    const scores: RatingDimensionScores = Object.fromEntries(
      ratingDimensions.map((d) => [d.id, base]),
    )
    void setUserBookRating({ bookUuid: book.uuid, dimensions: scores })
  }

  const removeAdvancedRating = useCallback(() => {
    if (currentReview) {
      void setUserBookRating({
        bookUuid: book.uuid,
        rating: null,
        review: currentReview,
        dimensions: null,
      })
    } else {
      void deleteUserBookRating({ bookUuid: book.uuid })
    }
  }, [book.uuid, currentReview, deleteUserBookRating, setUserBookRating])

  const handleSaveReview = async () => {
    const text = draft.trim()
    if (!text && currentRating == null && !hasDimensions) {
      await deleteUserBookRating({ bookUuid: book.uuid })
    } else {
      await setUserBookRating({
        bookUuid: book.uuid,
        review: text || null,
      })
    }
    setEditing(false)
  }

  const handleChangeDimensions = useCallback(
    (dimensions: RatingDimensionScores) => {
      void setUserBookRating({ bookUuid: book.uuid, dimensions })
    },
    [book.uuid, setUserBookRating],
  )

  const lastManualRef = useRef<number | null>(null)
  const setManualRating = useCallback(
    (value: number | null) => {
      if (value != null) lastManualRef.current = value
      void setUserBookRating({ bookUuid: book.uuid, rating: value })
    },
    [book.uuid, setUserBookRating],
  )

  const useDimensionAverage = useCallback(() => {
    if (currentDimensions) {
      void setUserBookRating({
        bookUuid: book.uuid,
        dimensions: currentDimensions,
      })
    }
  }, [book.uuid, currentDimensions, setUserBookRating])

  const dimensionAverage = computeRatingAverage(currentDimensions)
  const isManualOverride =
    hasDimensions &&
    currentRating != null &&
    dimensionAverage != null &&
    Math.abs(currentRating - dimensionAverage) > 0.01
  const canRevertManual =
    hasDimensions &&
    !isManualOverride &&
    lastManualRef.current != null &&
    lastManualRef.current !== currentRating

  return (
    <CollapsibleSection
      title={t("review.title")}
      icon={<icon.Star className="size-3.5 stroke-1" />}
      sectionKey="review"
      className={className}
      rightElement={
        <div className="flex items-center">
          {!editing && (
            <TooltipButton
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground font-thin"
              onClick={(e) => {
                e.stopPropagation()
                startEdit()
              }}
              aria-label={
                currentReview ? c("actions.edit") : t("review.addReview")
              }
              tooltip={
                currentReview ? c("actions.edit") : t("review.addReview")
              }
            >
              <icon.Pencil className="size-3.5 stroke-[1.5]" />
            </TooltipButton>
          )}
          {!hasDimensions && (
            <TooltipButton
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground ml-auto"
              onClick={(e) => {
                e.stopPropagation()
                addAdvancedRating()
              }}
              tooltip={t("review.addAdvanced")}
              aria-label={t("review.addAdvanced")}
            >
              <icon.ChartRadar className="size-3.5" />
            </TooltipButton>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {hasDimensions ? (
          <div className="flex flex-col items-center gap-2">
            <MultidimensionalRating
              dimensions={ratingDimensions}
              scores={currentDimensions}
              onChange={handleChangeDimensions}
              onRemove={removeAdvancedRating}
              rating={currentRating}
              onRatingChange={setManualRating}
              onUseAverage={useDimensionAverage}
              color={ratingColor}
            />

            {canRevertManual && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  setManualRating(lastManualRef.current)
                }}
              >
                {t("review.revertManual", {
                  rating: formatRating(lastManualRef.current ?? 0),
                })}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground sr-only text-xs uppercase">
              {t("review.yourRating")}
            </span>
            <RatingInput
              value={currentRating}
              onChange={applyManualRating}
              color={ratingColor}
            />
            <InlineRatingNumber
              value={currentRating}
              placeholder={t("review.ratePlaceholder")}
              onCommit={applyManualRating}
            />
          </div>
        )}

        {editing ? (
          <Field orientation="vertical">
            <FieldLabel htmlFor="review">{t("review.yourReview")}</FieldLabel>
            <Textarea
              id="review"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
              }}
              placeholder={t("review.reviewPlaceholder")}
              className="min-h-24 resize-y font-serif"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void handleSaveReview()
                }}
                disabled={isSaving}
              >
                {c("actions.save")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false)
                }}
                disabled={isSaving}
              >
                {c("actions.cancel")}
              </Button>
            </div>
          </Field>
        ) : (
          currentReview && (
            <p className="font-serif text-sm whitespace-pre-wrap">
              {currentReview}
            </p>
          )
        )}
      </div>
    </CollapsibleSection>
  )
}
