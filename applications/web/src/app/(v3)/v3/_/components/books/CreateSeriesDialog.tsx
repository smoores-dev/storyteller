import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useEffect } from "react"
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

import { useAddBooksToSeriesMutation } from "@/store/api"
import { type UUID } from "@/uuid"

const seriesSchema = z.object({
  name: z.string().min(1, "Name is required"),
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
  const [addBooksToSeries, { isLoading }] = useAddBooksToSeriesMutation()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SeriesFormData>({
    resolver: zodResolver(seriesSchema),
    defaultValues: {
      name: initialName,
      description: "",
    },
  })

  useEffect(() => {
    if (open) reset({ name: initialName, description: "" })
  }, [open, initialName, reset])

  const handleClose = useCallback(() => {
    reset()
    onOpenChange(false)
  }, [reset, onOpenChange])

  const onSubmit = useCallback(
    async (data: SeriesFormData) => {
      try {
        await addBooksToSeries({
          series: { name: data.name, description: data.description ?? "" },
          relations: (books ?? []).map((bookUuid, index) => ({
            bookUuid,
            position: index + 1,
            featured: false,
          })),
        }).unwrap()
        onCreated?.(data.name)
        handleClose()
      } catch {}
    },
    [addBooksToSeries, books, onCreated, handleClose],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Series</DialogTitle>
          <DialogDescription>
            Create a new series to group related books together.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="series-name">Name</FieldLabel>
              <Input
                id="series-name"
                placeholder="My Series"
                {...register("name")}
              />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="series-description">Description</FieldLabel>
              <Textarea
                id="series-description"
                placeholder="Optional description..."
                rows={3}
                {...register("description")}
              />
            </Field>
          </FieldGroup>
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
              {isLoading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
