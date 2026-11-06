import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useEffect, useEffectEvent, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
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
  FieldDescription,
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
  nextSeriesNumber,
  toSeriesRelations,
} from "@/app/(v3)/v3/_/components/books/seriesBoxes"
import { BookSelector } from "@/app/(v3)/v3/_/components/shelves/ShelfEditor"
import { useAddBooksToSeriesMutation, useListSeriesQuery } from "@/store/api"
import { type UUID } from "@/uuid"

const seriesSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
})

type SeriesFormData = z.infer<typeof seriesSchema>

type CreateSeriesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (name: string) => void
  initialName?: string
  books?: UUID[]
}

export function CreateSeriesDialog({
  open,
  onOpenChange,
  onCreated,
  initialName = "",
  books,
}: CreateSeriesDialogProps) {
  const t = useTranslation("SeriesDialog")
  const c = useCommon()
  const [addBooksToSeries, { isLoading }] = useAddBooksToSeriesMutation()
  const [entries, setEntries] = useState<SeriesEntry[]>([])

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<SeriesFormData>({
    resolver: zodResolver(seriesSchema),
    defaultValues: {
      name: initialName,
      description: "",
    },
  })

  // The server adds books to an existing series with the exact same name
  // instead of creating a new one, so warn before that happens
  const name = useWatch({ control, name: "name" })
  const normalizedName = name.trim().toLowerCase()
  const { existingName } = useListSeriesQuery(undefined, {
    skip: !open,
    selectFromResult: ({ data }) => ({
      existingName: normalizedName
        ? data?.find((s) => s.name.trim().toLowerCase() === normalizedName)
            ?.name
        : undefined,
    }),
  })

  // Pre-selected books start numbered in the order they were selected
  const resetEntries = useEffectEvent(() => {
    setEntries(
      (books ?? []).map((bookUuid, index) => ({
        bookUuid,
        position: index + 1,
        featured: false,
      })),
    )
  })

  useEffect(() => {
    if (!open) return
    reset({ name: initialName, description: "" })
    resetEntries()
  }, [open, initialName, reset])

  const handleClose = useCallback(() => {
    reset()
    onOpenChange(false)
  }, [reset, onOpenChange])

  const removeEntry = (bookUuid: string) => {
    setEntries((prev) => prev.filter((entry) => entry.bookUuid !== bookUuid))
  }

  const onSubmit = useCallback(
    async (data: SeriesFormData) => {
      try {
        await addBooksToSeries({
          series: { name: data.name, description: data.description ?? "" },
          relations: toSeriesRelations(entries),
        }).unwrap()
        onCreated?.(data.name)
        handleClose()
      } catch {}
    },
    [addBooksToSeries, entries, onCreated, handleClose],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Only the body scrolls, so the footer stays reachable for long series */}
          <div className="min-h-0 flex-1 overflow-y-auto px-px">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="series-name">{t("name")}</FieldLabel>
                <Input
                  id="series-name"
                  placeholder={t.plain("namePlaceholder")}
                  {...register("name")}
                />
                {errors.name && <FieldError>{t("nameRequired")}</FieldError>}
                {existingName !== undefined && (
                  <p className="text-warning text-sm">
                    {t(existingName === name ? "existingName" : "similarName", {
                      name: existingName,
                    })}
                  </p>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="series-description">
                  {t("description")}
                </FieldLabel>
                <Textarea
                  id="series-description"
                  placeholder={t.plain("descriptionPlaceholder")}
                  rows={3}
                  {...register("description")}
                />
              </Field>
              <Field>
                <FieldLabel>{t("books")}</FieldLabel>
                <BookSelector
                  selectedBookUuids={entries.map((entry) => entry.bookUuid)}
                  showSelected={false}
                  onAdd={(uuid, book) => {
                    setEntries((prev) =>
                      prev.some((entry) => entry.bookUuid === uuid)
                        ? prev
                        : [
                            ...prev,
                            {
                              bookUuid: book.uuid,
                              title: book.title,
                              createdAt: book.createdAt,
                              position: nextSeriesNumber(prev),
                              featured: false,
                            },
                          ],
                    )
                  }}
                  onRemove={removeEntry}
                />
                {/* An empty series is deleted as soon as it's edited and is
                    hidden everywhere books can be added to a series */}
                <FieldDescription>{t("createBooksHint")}</FieldDescription>
              </Field>
            </FieldGroup>
            {entries.length > 0 && (
              <div className="py-4">
                <SeriesOrderEditor
                  entries={entries}
                  onEntriesChange={setEntries}
                  onRemoveBook={removeEntry}
                />
              </div>
            )}
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
            <Button type="submit" disabled={isLoading || entries.length === 0}>
              {isLoading ? c("states.creating") : c("actions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
