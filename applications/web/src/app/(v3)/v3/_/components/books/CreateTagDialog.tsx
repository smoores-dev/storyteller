import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"

import { Button } from "@v3/_/components/ui/button"
import { ColorPicker } from "@v3/_/components/ui/color-picker"
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
import { IconPicker } from "@v3/_/components/ui/icon-picker"
import { Input } from "@v3/_/components/ui/input"

import { useAddTagsToBooksMutation, useCreateTagMutation } from "@/store/api"
import { type UUID } from "@/uuid"

const tagSchema = z.object({
  name: z.string().min(1, "Name is required"),
})

type TagFormData = z.infer<typeof tagSchema>

type CreateTagDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (tag: { uuid: string; name: string }) => void
  initialName?: string
  books?: string[]
}

export function CreateTagDialog({
  open,
  onOpenChange,
  onCreated,
  initialName = "",
  books,
}: CreateTagDialogProps) {
  const [createTag, { isLoading: isCreating }] = useCreateTagMutation()
  const [addTags, { isLoading: isAttaching }] = useAddTagsToBooksMutation()
  const isLoading = isCreating || isAttaching

  const [icon, setIcon] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TagFormData>({
    resolver: zodResolver(tagSchema),
    defaultValues: { name: initialName },
  })

  useEffect(() => {
    if (!open) return
    reset({ name: initialName })
    setIcon(null)
    setColor(null)
  }, [open, initialName, reset])

  const handleClose = useCallback(() => {
    reset()
    onOpenChange(false)
  }, [reset, onOpenChange])

  const onSubmit = useCallback(
    async (data: TagFormData) => {
      try {
        const tag = await createTag({ name: data.name, icon, color }).unwrap()

        if (books?.length) {
          await addTags({
            tags: [{ uuid: tag.uuid }],
            books: books as UUID[],
          }).unwrap()
        }

        onCreated?.(tag)
        handleClose()
      } catch {}
    },
    [createTag, addTags, icon, color, books, onCreated, handleClose],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Tag</DialogTitle>
          <DialogDescription>
            Create a new tag to label your books.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="tag-name">Name</FieldLabel>
              <Input id="tag-name" placeholder="My Tag" {...register("name")} />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel>Icon & Color</FieldLabel>
              <div className="flex items-center gap-2">
                <IconPicker value={icon} onChange={setIcon} color={color} />
                <ColorPicker value={color} onChange={setColor} />
              </div>
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
