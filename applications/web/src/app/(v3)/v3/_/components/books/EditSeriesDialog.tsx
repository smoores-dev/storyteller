import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"

import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import { Textarea } from "@v3/_/components/ui/textarea"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { SeriesOrderEditor } from "@/app/(v3)/v3/_/components/books/SeriesOrderEditor"
import {
  type SeriesEntry,
  toSeriesRelations,
} from "@/app/(v3)/v3/_/components/books/seriesBoxes"
import {
  useListInfiniteBooksInfiniteQuery,
  useUpdateSeriesMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

const seriesSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
})

type SeriesFormData = z.infer<typeof seriesSchema>

type EditSeriesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  series: {
    uuid: UUID
    name: string
    description: string | null
  } | null
  onUpdated?: () => void
}

export function EditSeriesDialog({
  open,
  onOpenChange,
  series,
  onUpdated,
}: EditSeriesDialogProps) {
  const t = useTranslation("SeriesDialog")
  const c = useCommon()
  const [updateSeries, { isLoading }] = useUpdateSeriesMutation()

  // Saving replaces every book in the series with the ones listed here, so
  // every page has to load first or books on later pages would be removed
  const {
    data: booksData,
    hasNextPage,
    isFetchingNextPage,
    isError,
    fetchNextPage,
    refetch,
  } = useListInfiniteBooksInfiniteQuery(
    {
      series: series?.uuid,
      limit: 100,
      // A fixed order keeps offset paging from skipping or repeating books
      orderBy: "seriesPosition",
      orderDirection: "asc",
    },
    { skip: !series?.uuid || !open },
  )

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) {
      void fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage])

  const isLoadingBooks = !booksData || hasNextPage

  const seriesUuid = series?.uuid
  const books = useMemo(() => booksData?.pages.flat() ?? [], [booksData])
  const [entries, setEntries] = useState<SeriesEntry[]>([])

  useEffect(() => {
    if (!seriesUuid) return
    setEntries(
      books.map((book) => {
        const seriesInfo = book.series.find((s) => s.uuid === seriesUuid)
        return {
          bookUuid: book.uuid,
          title: book.title,
          createdAt: book.createdAt,
          position: seriesInfo?.position ?? null,
          featured: seriesInfo?.featured ?? false,
        }
      }),
    )
  }, [books, seriesUuid])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SeriesFormData>({
    resolver: zodResolver(seriesSchema),
    defaultValues: {
      name: series?.name ?? "",
      description: series?.description ?? "",
    },
  })

  useEffect(() => {
    if (series) {
      reset({
        name: series.name,
        description: series.description ?? "",
      })
    }
  }, [series, reset])

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const onSubmit = useCallback(
    async (data: SeriesFormData) => {
      if (!series) return
      try {
        await updateSeries({
          uuid: series.uuid,
          update: {
            name: data.name,
            description: data.description ?? "",
            relations: toSeriesRelations(entries),
          },
        }).unwrap()
        onUpdated?.()
        handleClose()
      } catch {}
    },
    [updateSeries, series, onUpdated, handleClose, entries],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Only the body scrolls, so the footer stays reachable for long series */}
          <div className="min-h-0 flex-1 overflow-y-auto px-px">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="edit-series-name">{t("name")}</FieldLabel>
                <Input
                  id="edit-series-name"
                  placeholder={t.plain("namePlaceholder")}
                  {...register("name")}
                />
                {errors.name && <FieldError>{t("nameRequired")}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-series-description">
                  {t("description")}
                </FieldLabel>
                <Textarea
                  id="edit-series-description"
                  placeholder={t.plain("descriptionPlaceholder")}
                  rows={3}
                  {...register("description")}
                />
              </Field>
            </FieldGroup>
            <div className="py-4">
              <h2 className="pb-1 text-sm font-medium">{t("booksInSeries")}</h2>
              <p className="text-muted-foreground pb-2 text-xs">
                {t("editBooksHint")}
              </p>
              {/* Hidden until every page loads, so books don't appear
                  mid-drag */}
              {isError ? (
                <p className="text-destructive flex items-center gap-2 text-xs">
                  {t("booksLoadError")}
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      void refetch()
                    }}
                  >
                    {t("tryAgain")}
                  </Button>
                </p>
              ) : isLoadingBooks ? (
                <p className="text-muted-foreground text-xs">
                  {c("states.loading")}
                </p>
              ) : (
                <SeriesOrderEditor
                  key={seriesUuid}
                  entries={entries}
                  onEntriesChange={setEntries}
                />
              )}
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              {c("actions.cancel")}
            </Button>
            {/* Saving a partial book list would remove the missing books, and
                an empty one deletes the series */}
            <Button
              type="submit"
              disabled={isLoading || isLoadingBooks || isError}
            >
              {isLoading ? c("states.saving") : c("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
