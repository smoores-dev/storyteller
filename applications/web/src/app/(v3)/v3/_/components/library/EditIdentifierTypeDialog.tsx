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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import {
  useListIdentifierTypesQuery,
  useUpdateIdentifierTypeMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

const identifierTypeSchema = z.object({
  name: z.string().min(1),
  urlTemplate: z.string(),
})

type IdentifierTypeFormData = z.infer<typeof identifierTypeSchema>

export function EditIdentifierTypeDialog({
  open,
  onOpenChange,
  identifierType,
  onUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  identifierType: { uuid: string; name: string } | null
  onUpdated?: () => void
}) {
  const t = useTranslation("EntityActions")
  const c = useCommon()
  const [updateIdentifierType, { isLoading }] =
    useUpdateIdentifierTypeMutation()

  const { data: allTypes = [] } = useListIdentifierTypesQuery()
  const fullType = identifierType
    ? allTypes.find((candidate) => candidate.uuid === identifierType.uuid)
    : null

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<IdentifierTypeFormData>({
    resolver: zodResolver(identifierTypeSchema),
    defaultValues: { name: identifierType?.name ?? "", urlTemplate: "" },
  })

  useEffect(() => {
    if (open && identifierType) {
      reset({
        name: identifierType.name,
        urlTemplate: fullType?.urlTemplate ?? "",
      })
    }
  }, [open, identifierType, fullType?.urlTemplate, reset])

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const onSubmit = useCallback(
    async (data: IdentifierTypeFormData) => {
      if (!identifierType) return

      try {
        await updateIdentifierType({
          uuid: identifierType.uuid as UUID,
          update: {
            name: data.name,
            urlTemplate: data.urlTemplate.trim() || null,
          },
        }).unwrap()

        onUpdated?.()
        handleClose()
      } catch {}
    },
    [updateIdentifierType, identifierType, onUpdated, handleClose],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editIdentifier")}</DialogTitle>
          <DialogDescription>
            {t("editIdentifierDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="edit-identifier-name">
                {t("identifierName")}
              </FieldLabel>
              <Input
                id="edit-identifier-name"
                placeholder={t("identifierName")}
                {...register("name")}
              />
              {errors.name && <FieldError>{t("nameRequired")}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-identifier-url-template">
                {t("identifierUrlTemplate")}
              </FieldLabel>
              <Input
                id="edit-identifier-url-template"
                placeholder="https://example.com/book/{value}"
                className="font-mono text-xs"
                {...register("urlTemplate")}
              />
              <FieldDescription>
                {t("identifierUrlTemplateHint")}
              </FieldDescription>
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
