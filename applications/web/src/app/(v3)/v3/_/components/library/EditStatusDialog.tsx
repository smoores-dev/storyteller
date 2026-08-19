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

import { isWellKnownStatus } from "@/database/statusKinds"
import { useListStatusesQuery, useUpdateStatusLabelMutation } from "@/store/api"
import { type UUID } from "@/uuid"

const statusSchema = z.object({
  label: z.string().min(1),
})

type StatusFormData = z.infer<typeof statusSchema>

type EditStatusDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: { uuid: string; name: string } | null
}

export function EditStatusDialog({
  open,
  onOpenChange,
  status,
}: EditStatusDialogProps) {
  const t = useTranslation("EntityActions")
  const c = useCommon()
  const [updateLabel, { isLoading }] = useUpdateStatusLabelMutation()

  const { data: allStatuses = [] } = useListStatusesQuery()
  const fullStatus = status
    ? allStatuses.find((s) => s.uuid === status.uuid)
    : null

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StatusFormData>({
    resolver: zodResolver(statusSchema),
    defaultValues: { label: status?.name ?? "" },
  })

  useEffect(() => {
    if (!open || !fullStatus) return

    reset({ label: fullStatus.label ?? fullStatus.name })
  }, [open, fullStatus, reset])

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const onSubmit = useCallback(
    async (data: StatusFormData) => {
      if (!status) return

      try {
        await updateLabel({
          uuid: status.uuid as UUID,
          label: data.label,
        }).unwrap()

        handleClose()
      } catch {}
    },
    [updateLabel, status, handleClose],
  )

  const showKindHint = fullStatus && isWellKnownStatus(fullStatus.name)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editStatus")}</DialogTitle>
          <DialogDescription>{t("editStatusDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="edit-status-label">
                {t("statusLabel")}
              </FieldLabel>

              <Input
                id="edit-status-label"
                placeholder={t("statusLabel")}
                {...register("label")}
              />

              {errors.label && <FieldError>{t("nameRequired")}</FieldError>}
            </Field>

            {showKindHint && (
              <Field>
                <FieldLabel>{t("statusKind")}</FieldLabel>

                <p className="text-muted-foreground text-sm">
                  {fullStatus.name}
                </p>
              </Field>
            )}
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
