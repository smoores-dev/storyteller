"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { type FieldErrors, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { LANGUAGES } from "@storyteller-platform/ghost-story/constants"

import { Button } from "@v3/_/components/ui/button"
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@v3/_/components/ui/button-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@v3/_/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { Spinner } from "@v3/_/components/ui/spinner"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { type Settings } from "@/apiModels"
import {
  type SettingsFormForm,
  SettingsFormProvider,
} from "@/app/(v3)/v3/_/components/settings-form/SettingsFormProvider"
import { ProcessingSettingsFields } from "@/app/(v3)/v3/_/components/settings-form/processing-tab"
import { useFormatDuration } from "@/app/(v3)/v3/_/lib/formatters"
import { type BookWithRelations } from "@/database/books"
import { SettingsSchema } from "@/database/settingsTypes"
import * as icon from "@/icons"
import {
  useGetAlignmentEstimateQuery,
  useGetSettingsQuery,
  useProcessBookMutation,
  useUpdateSettingsMutation,
} from "@/store/api"
import { RUN_CONFIG_SETTING_KEYS, type RunConfig } from "@/work/runConfig"

import { type ProcessRestart } from "./useProcessingRun"

export function ProcessRunDialog({
  book,
  restart = false,
  open,
  onOpenChange,
}: {
  book: BookWithRelations
  restart?: ProcessRestart
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: settings } = useGetSettingsQuery(undefined, { skip: !open })
  const t = useTranslation("Processing")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 pb-3">
          <DialogTitle>
            {book.readaloud
              ? t("dialogTitleReprocess", { title: book.title })
              : t("dialogTitle", { title: book.title })}
          </DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        {settings ? (
          <RunConfigForm
            book={book}
            settings={settings}
            restart={restart}
            onClose={() => {
              onOpenChange(false)
            }}
          />
        ) : (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RunConfigForm({
  book,
  settings,
  restart,
  onClose,
}: {
  book: BookWithRelations
  settings: Settings
  restart: ProcessRestart
  onClose: () => void
}) {
  const form = useForm({
    defaultValues: settings,
    resolver: zodResolver(SettingsSchema),
  })
  const [language, setLanguage] = useState(book.language ?? "auto")
  const [processBook, { isLoading: isProcessing }] = useProcessBookMutation()
  const [updateSettings, { isLoading: isSaving }] = useUpdateSettingsMutation()
  const t = useTranslation("Processing")
  const formatDuration = useFormatDuration()

  const watchedAligner = useWatch({ control: form.control, name: "aligner" })
  const watchedEngine = useWatch({
    control: form.control,
    name: "transcriptionEngine",
  })
  const watchedModel = useWatch({
    control: form.control,
    name: "whisperModel",
  })
  const watchedCtcEngine = useWatch({
    control: form.control,
    name: "ctcEngine",
  })

  const isCtc = (watchedAligner ?? settings.aligner) === "ctc"

  const { data: estimate } = useGetAlignmentEstimateQuery(
    {
      bookUuid: book.uuid,
      engine: isCtc
        ? (watchedCtcEngine ?? settings.ctcEngine ?? "wav2vec-local")
        : (watchedEngine ?? settings.transcriptionEngine ?? "whisper.cpp"),
      whisperModel: isCtc
        ? null
        : (watchedModel ?? settings.whisperModel ?? null),
      restart: restart || false,
    },
    { skip: !book.uuid },
  )

  function reportInvalid(errors: FieldErrors<Settings>) {
    toast.error(t("toastFailed"), {
      description: Object.keys(errors).join(", "),
    })
  }

  async function start(values: Settings, saveAsDefaults: boolean) {
    const config: Partial<RunConfig> = {
      language: language === "auto" ? null : language,
    }
    for (const key of RUN_CONFIG_SETTING_KEYS) {
      ;(config as Record<string, unknown>)[key] = values[key]
    }

    try {
      await processBook({ uuid: book.uuid, restart, config }).unwrap()
      if (saveAsDefaults) {
        await updateSettings(values).unwrap()
        toast.success(t("toastSavedAndStarted"), { dismissible: true })
      } else {
        toast.success(t("toastStarted"), { dismissible: true })
      }
      onClose()
    } catch (e) {
      toast.error(t("toastFailed"), {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }

  const busy = isProcessing || isSaving

  const languageItems = LANGUAGES.map((lang) => ({
    value: lang,
    label: lang,
  }))
  return (
    <SettingsFormProvider
      form={form as SettingsFormForm}
      lockedSettings={new Set()}
    >
      <form
        onSubmit={form.handleSubmit(
          (values) => start(values, false),
          reportInvalid,
        )}
        className="relative flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-px">
          <div className="flex flex-col gap-4 py-1">
            <Field>
              <FieldLabel htmlFor="run-language">{t("language")}</FieldLabel>
              <Select
                value={language}
                onValueChange={(v) => {
                  setLanguage(v ?? "auto")
                }}
                items={languageItems}
              >
                <SelectTrigger id="run-language" className="w-full">
                  <SelectValue placeholder={t("autoLanguage")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t("autoLanguage")}</SelectItem>
                  {languageItems.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <ProcessingSettingsFields collapsible restart={restart} />
          </div>
        </div>

        {estimate && (
          <div className="text-muted-foreground px-px py-2 text-sm">
            {estimate.estimateSeconds != null
              ? t("estimatedTime", {
                  duration: formatDuration(estimate.estimateSeconds, {
                    approximate: true,
                  }),
                })
              : t("noEstimateHistory")}
          </div>
        )}

        <DialogFooter className="bg-background absolute bottom-0 mt-0 w-full border-t pt-3">
          <ButtonGroup>
            <Button disabled={busy} type="submit">
              {busy ? t("starting") : t("start")}
            </Button>
            <ButtonGroupSeparator />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button disabled={busy} aria-label={t("moreStartOptions")}>
                    <icon.ChevronDown className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    void form.handleSubmit(
                      (values) => start(values, true),
                      reportInvalid,
                    )()
                  }}
                >
                  {t("saveAsDefaults")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </DialogFooter>
      </form>
    </SettingsFormProvider>
  )
}
