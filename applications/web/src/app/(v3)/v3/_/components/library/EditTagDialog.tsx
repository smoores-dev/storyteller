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
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { useListTagsQuery, useUpdateTagMutation } from "@/store/api"
import { type UUID } from "@/uuid"

const tagSchema = z.object({
  name: z.string().min(1),
})

type TagFormData = z.infer<typeof tagSchema>

type EditTagDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tag: { uuid: string; name: string } | null
  onUpdated?: () => void
}

export function EditTagDialog({
  open,
  onOpenChange,
  tag,
  onUpdated,
}: EditTagDialogProps) {
  const t = useTranslation("EntityActions")
  const c = useCommon()
  const [updateTag, { isLoading }] = useUpdateTagMutation()

  const { data: allTags = [] } = useListTagsQuery()
  const fullTag = tag
    ? allTags.find((candidate) => candidate.uuid === tag.uuid)
    : null

  const [icon, setIcon] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TagFormData>({
    resolver: zodResolver(tagSchema),
    defaultValues: { name: tag?.name ?? "" },
  })

  useEffect(() => {
    if (open && tag) {
      reset({ name: tag.name })
      setIcon(fullTag?.icon ?? null)
      setColor(fullTag?.color ?? null)
    }
  }, [open, tag, fullTag?.icon, fullTag?.color, reset])

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const onSubmit = useCallback(
    async (data: TagFormData) => {
      if (!tag) return

      try {
        await updateTag({
          uuid: tag.uuid as UUID,
          update: { name: data.name, icon, color },
        }).unwrap()

        onUpdated?.()
        handleClose()
      } catch {}
    },
    [updateTag, tag, icon, color, onUpdated, handleClose],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTag")}</DialogTitle>
          <DialogDescription>{t("editTagDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="edit-tag-name">{t("tagName")}</FieldLabel>
              <Input
                id="edit-tag-name"
                placeholder={t("tagName")}
                {...register("name")}
              />
              {errors.name && <FieldError>{t("nameRequired")}</FieldError>}
            </Field>

            <Field>
              <FieldLabel>{t("iconAndColor")}</FieldLabel>
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
              {c("actions.cancel")}
            </Button>

            <Button type="submit" disabled={isLoading}>
              {isLoading ? c("states.saving") : c("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
