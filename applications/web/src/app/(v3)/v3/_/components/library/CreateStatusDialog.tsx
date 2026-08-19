"use client"

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

import { useCreateStatusMutation } from "@/store/api"

const statusSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
})

type StatusFormData = z.infer<typeof statusSchema>

type CreateStatusDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateStatusDialog({
  open,
  onOpenChange,
}: CreateStatusDialogProps) {
  const t = useTranslation("EntityActions")
  const c = useCommon()
  const [createStatus, { isLoading }] = useCreateStatusMutation()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StatusFormData>({
    resolver: zodResolver(statusSchema),
    defaultValues: { name: "", label: "" },
  })

  useEffect(() => {
    if (!open) return

    reset({ name: "", label: "" })
  }, [open, reset])

  const handleClose = useCallback(() => {
    reset()
    onOpenChange(false)
  }, [reset, onOpenChange])

  const onSubmit = useCallback(
    async (data: StatusFormData) => {
      try {
        const label = data.label?.trim() || undefined
        await createStatus({ name: data.name, label }).unwrap()

        handleClose()
      } catch {}
    },
    [createStatus, handleClose],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createStatus")}</DialogTitle>
          <DialogDescription>{t("createStatusDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="create-status-name">
                {t("statusName")}
              </FieldLabel>

              <Input
                id="create-status-name"
                placeholder={t("statusName")}
                {...register("name")}
              />

              {errors.name && <FieldError>{t("nameRequired")}</FieldError>}

              <p className="text-muted-foreground text-xs">
                {t("statusNameHint")}
              </p>
            </Field>

            <Field>
              <FieldLabel htmlFor="create-status-label">
                {t("statusLabel")}
              </FieldLabel>

              <Input
                id="create-status-label"
                placeholder={t("statusLabel")}
                {...register("label")}
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
              {isLoading ? c("states.creating") : c("actions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
