import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useEffect, useMemo } from "react"
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

import {
  useListInfiniteBooksInfiniteQuery,
  useUpdateSeriesMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

const seriesSchema = z.object({
  name: z.string().min(1, "Name is required"),
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
  const [updateSeries, { isLoading }] = useUpdateSeriesMutation()

  // TODO: should probably not limit
  const { data: booksData } = useListInfiniteBooksInfiniteQuery(
    { series: series?.uuid, limit: 100 },
    { skip: !series?.uuid || !open },
  )

  const currentRelations = useMemo(() => {
    if (!booksData?.pages || !series) return []
    const books = booksData.pages.flat()
    return books.map((book) => {
      const seriesInfo = book.series.find((s) => s.uuid === series.uuid)
      return {
        bookUuid: book.uuid,
        position: seriesInfo?.position ?? null,
        featured: seriesInfo?.featured ?? false,
      }
    })
  }, [booksData, series])

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
            relations: currentRelations,
          },
        }).unwrap()
        onUpdated?.()
        handleClose()
      } catch {}
    },
    [updateSeries, series, onUpdated, handleClose, currentRelations],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Series</DialogTitle>
          <DialogDescription>
            Update the series name and description.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="edit-series-name">Name</FieldLabel>
              <Input
                id="edit-series-name"
                placeholder="Series name"
                {...register("name")}
              />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-series-description">
                Description
              </FieldLabel>
              <Textarea
                id="edit-series-description"
                placeholder="Optional description..."
                rows={3}
                {...register("description")}
              />
            </Field>
          </FieldGroup>
          <div className="py-4">
            <h2 className="text-sm font-medium">Books in this series</h2>
            <div className="grid grid-cols-1 gap-2">
              {booksData?.pages
                .flat()
                .map((book) => <div key={book.uuid}>{book.title}</div>)}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
