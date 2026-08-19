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
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { useUpdateCreatorMutation } from "@/store/api"

const creatorSchema = z.object({
  name: z.string().min(1),
  fileAs: z.string().optional(),
})

type CreatorFormData = z.infer<typeof creatorSchema>

type EditCreatorDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  creator: { uuid: string; name: string; fileAs: string | null } | null
  onUpdated?: () => void
}

export function EditCreatorDialog({
  open,
  onOpenChange,
  creator,
  onUpdated,
}: EditCreatorDialogProps) {
  const t = useTranslation("EntityActions")
  const c = useCommon()
  const [updateCreator, { isLoading }] = useUpdateCreatorMutation()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreatorFormData>({
    resolver: zodResolver(creatorSchema),
    defaultValues: {
      name: creator?.name ?? "",
      fileAs: creator?.fileAs ?? "",
    },
  })

  useEffect(() => {
    if (creator) {
      reset({
        name: creator.name,
        fileAs: creator.fileAs ?? "",
      })
    }
  }, [creator, reset])

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const onSubmit = useCallback(
    async (data: CreatorFormData) => {
      if (!creator) return

      try {
        await updateCreator({
          uuid: creator.uuid as `${string}-${string}-${string}-${string}-${string}`,
          update: {
            name: data.name,
            fileAs: data.fileAs || undefined,
          },
        }).unwrap()

        onUpdated?.()
        handleClose()
      } catch {}
    },
    [updateCreator, creator, onUpdated, handleClose],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editCreator")}</DialogTitle>
          <DialogDescription>{t("editCreatorDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="edit-creator-name">
                {t("creatorName")}
              </FieldLabel>
              <Input
                id="edit-creator-name"
                placeholder={t("creatorName")}
                {...register("name")}
              />
              {errors.name && <FieldError>{t("nameRequired")}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-creator-file-as">
                {t("sortAs")}
              </FieldLabel>
              <Input
                id="edit-creator-file-as"
                placeholder={t("sortAsPlaceholder")}
                {...register("fileAs")}
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
