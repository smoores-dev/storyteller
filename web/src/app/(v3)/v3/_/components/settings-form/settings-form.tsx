"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  IconAlertCircle,
  IconDownload,
  IconHistory,
  IconMail,
  IconMicrophone,
  IconRss,
  IconSearch,
  IconSettings2,
  IconShield,
  IconUpload,
  IconX,
} from "@tabler/icons-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { type SingleParser, parseAsString, useQueryState } from "nuqs"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { type FieldErrors, useForm } from "react-hook-form"
import { toast } from "sonner"
import { type z } from "zod"

import { type Settings } from "@/apiModels"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/(v3)/v3/_/components/ui/tooltip"
import { SettingsSchema } from "@/database/settingsTypes"
import {
  useGetMaxUploadChunkSizeQuery,
  useUpdateSettingsMutation,
} from "@/store/api"

import { SiteHeader } from "@v3/_/components/site-header"
import { Button } from "@v3/_/components/ui/button"
import { Input } from "@v3/_/components/ui/input"
import { Spinner } from "@v3/_/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@v3/_/components/ui/tabs"

import { SettingsFormProvider } from "./SettingsFormProvider"
import { AuthTab } from "./auth-tab"
import { ChangelogTab } from "./changelog-tab"
import { EmailTab } from "./email-tab"
import { LibraryTab } from "./library-tab"
import { OpdsTab } from "./opds-tab"
import { type IsMatch, SearchContext } from "./shared"
import { type SectionKeywords, type Tab } from "./tabs"
import { TranscriptionTab } from "./transcription-tab"
import { UploadTab } from "./upload-tab"

type ErrorPathSegment = string | number

type FlattenedFieldError = {
  key: ErrorPathSegment[]
  message?: string
  type?: string
}

type ResolvedFieldError = FlattenedFieldError & {
  keyPath: string
  labelKey?: string
  label: string
}

type SettingsTranslations = ReturnType<typeof useTranslations<"SettingsPage">>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFieldErrorValue(
  value: unknown,
): value is { message?: string; type?: string } {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value["message"] === "string" || typeof value["type"] === "string"
  )
}

function flattenNestedErrors(
  node: unknown,
  parentPath: ErrorPathSegment[] = [],
): FlattenedFieldError[] {
  if (!node) {
    return []
  }

  if (Array.isArray(node)) {
    return node.flatMap((child, index) => {
      return flattenNestedErrors(child, [...parentPath, index])
    })
  }

  if (!isRecord(node)) {
    return []
  }

  if (isFieldErrorValue(node)) {
    const flattenedError: FlattenedFieldError = {
      key: parentPath,
    }

    if (typeof node["message"] === "string") {
      flattenedError.message = node["message"]
    }

    if (typeof node["type"] === "string") {
      flattenedError.type = node["type"]
    }

    return [flattenedError]
  }

  return Object.entries(node).flatMap(([segment, child]) => {
    return flattenNestedErrors(child, [...parentPath, segment])
  })
}

function stringifyErrorPath(path: ErrorPathSegment[]): string {
  return path.reduce<string>((result, segment, index) => {
    if (typeof segment === "number") {
      return `${result}[${segment}]`
    }

    if (index === 0) {
      return segment
    }

    return `${result}.${segment}`
  }, "")
}

function resolveFieldErrors(
  errors: FlattenedFieldError[],
  _t: SettingsTranslations,
): ResolvedFieldError[] {
  return errors.map((error) => {
    const labelKey = error.key
      .map((key) => {
        if (typeof key === "number") {
          return `#${key + 1}`
        }

        // TODO: Figure out a way to get the label for the field
        // TODO: figure out how to dynamically set zod locale based on the current locale while not importing the entire zod library
        return key
      })
      .join(" => ")
    const keyPath = stringifyErrorPath(error.key)
    const label = labelKey

    const resolvedError: ResolvedFieldError = {
      ...error,
      keyPath,
      label,
    }

    if (labelKey) {
      resolvedError.labelKey = labelKey
    }

    return resolvedError
  })
}

export function SettingsForm({
  settings,
  sectionKeywords,
  configLockedKeys,
  currentVersion,
}: {
  settings: Settings
  sectionKeywords: SectionKeywords
  configLockedKeys: (keyof Settings)[]
  currentVersion: string
}) {
  const t = useTranslations("SettingsPage")
  const title = t("title")
  const { data: maxUploadChunkSize } = useGetMaxUploadChunkSizeQuery()
  const [updateSettings, { isLoading: isSaving }] = useUpdateSettingsMutation()
  const [searchQuery, setSearchQuery] = useState("")
  const lockedKeys = new Set(configLockedKeys)

  const form = useForm({
    resolver: zodResolver(SettingsSchema),
    defaultValues: {
      ...settings,
      transcriptionEngine: settings.transcriptionEngine ?? "whisper.cpp",
      whisperModel: settings.whisperModel ?? "tiny",
      whisperCpuFallback: settings.whisperCpuFallback ?? null,
      whisperServerUrl: settings.whisperServerUrl ?? "",
      whisperServerApiKey: settings.whisperServerApiKey ?? "",
      maxTrackLength: settings.maxTrackLength ?? 2,
      codec: settings.codec ?? "",
      bitrate: settings.bitrate ?? "",
      googleCloudApiKey: settings.googleCloudApiKey ?? "",
      azureSubscriptionKey: settings.azureSubscriptionKey ?? "",
      azureServiceRegion: settings.azureServiceRegion ?? "",
      amazonTranscribeRegion: settings.amazonTranscribeRegion ?? "",
      amazonTranscribeAccessKeyId: settings.amazonTranscribeAccessKeyId ?? "",
      amazonTranscribeSecretAccessKey:
        settings.amazonTranscribeSecretAccessKey ?? "",
      amazonTranscribeBucketName: settings.amazonTranscribeBucketName ?? "",
      openAiApiKey: settings.openAiApiKey ?? "",
      openAiOrganization: settings.openAiOrganization ?? "",
      openAiBaseUrl: settings.openAiBaseUrl ?? "",
      openAiModelName: settings.openAiModelName ?? "",
      deepgramApiKey: settings.deepgramApiKey ?? "",
      deepgramModel: settings.deepgramModel ?? "nova-3",
      disablePasswordLogin: settings.disablePasswordLogin,
    },
  })
  const { handleSubmit, formState } = form
  const errorCount = Object.keys(formState.errors).length

  const onSubmit = async (data: z.output<typeof SettingsSchema>) => {
    try {
      await updateSettings(data).unwrap()
      toast.success(t("settingsSavedSuccessfully"))
    } catch {
      toast.error(t("failedToSaveSettings"))
    }
  }

  const onInvalidSubmit = (
    errors: FieldErrors<z.output<typeof SettingsSchema>>,
  ) => {
    const flattenedErrors = flattenNestedErrors(errors)
    const resolvedErrors = resolveFieldErrors(flattenedErrors, t)
    const fieldErrorCount = resolvedErrors.length

    if (fieldErrorCount === 0) {
      toast.error(t("failedToSaveSettings"))
      return
    }

    const maxErrorsInToast = 5
    const visibleErrors = resolvedErrors.slice(0, maxErrorsInToast)
    const hiddenErrorCount = fieldErrorCount - visibleErrors.length
    const hasHiddenErrors = hiddenErrorCount > 0

    const errorDetails = visibleErrors
      .map((error) => {
        return `${error.label}: ${error.message}`
      })
      .join("\n")

    const description = hasHiddenErrors
      ? `${errorDetails}\n+${hiddenErrorCount} more`
      : errorDetails

    toast.error(
      t("formHasErrors", {
        count: fieldErrorCount,
        plural: fieldErrorCount === 1 ? "one" : "other",
      }),
      {
        description,
      },
    )
  }

  const tabs = useMemo(
    () =>
      [
        {
          value: "library",
          label: t("tabs.library.title"),
          icon: IconSettings2,
        },
        {
          value: "transcription",
          label: t("tabs.transcription.title"),
          icon: IconMicrophone,
        },
        { value: "auth", label: t("tabs.auth.title"), icon: IconShield },
        { value: "upload", label: t("tabs.upload.title"), icon: IconUpload },
        { value: "email", label: t("tabs.email.title"), icon: IconMail },
        { value: "opds", label: t("tabs.opds.title"), icon: IconRss },
        { value: "changelog", label: "Changelog", icon: IconHistory },
      ] as const,
    [t],
  )

  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsString.withDefault("library") as SingleParser<Tab>,
  )

  const setActiveTabEvent = useCallback(
    (tab: Tab) => {
      void setActiveTab(tab)
    },
    [setActiveTab],
  )

  const matchingSections = useMemo(() => {
    if (!searchQuery) return new Set(tabs.map((t) => t.value))

    const query = searchQuery.toLowerCase()
    const matching = new Set<string>()

    for (const [tab, sections] of Object.entries(sectionKeywords)) {
      for (const [section, keywords] of Object.entries(sections)) {
        const matchesKeywords = keywords.some((kw) =>
          kw.toLowerCase().includes(query),
        )
        if (matchesKeywords) {
          matching.add(`${tab}.${section}`)
        }
      }
    }
    return matching
  }, [searchQuery, tabs, sectionKeywords])

  const matchingTabs = useMemo(() => {
    return new Set<Tab>(
      Array.from(matchingSections.values()).map(
        (tab) => tab.split(".")[0] as Tab,
      ),
    )
  }, [matchingSections])

  const isMatch: IsMatch = (tab, section) => {
    return matchingSections.has(`${tab}.${section}`)
  }

  const prefActiveTab = useRef<Tab | null>(null)
  prefActiveTab.current = activeTab
  useEffect(() => {
    if (!searchQuery) return

    const firstMatch = Array.from(matchingTabs)[0]

    if (
      firstMatch &&
      (!prefActiveTab.current || !matchingTabs.has(prefActiveTab.current))
    ) {
      setActiveTabEvent(firstMatch)
    }
  }, [matchingTabs, searchQuery, setActiveTabEvent])

  const filteredTabs = searchQuery
    ? tabs.filter(
        (tab) => matchingTabs.has(tab.value) || tab.value === "changelog",
      )
    : tabs

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SiteHeader
        breadcrumbs={[{ label: title }]}
        actions={
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              render={
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Link
                        href="/api/v2/settings"
                        aria-label="Export settings as JSON"
                        download="storyteller-config.json"
                      >
                        <IconDownload size={16} />{" "}
                      </Link>
                    }
                  />
                  <TooltipContent>{t("exportSettings")}</TooltipContent>
                </Tooltip>
              }
            />
            {errorCount > 0 && (
              <div className="text-destructive flex items-center gap-1.5 text-sm">
                <IconAlertCircle className="h-4 w-4" />
                <span>
                  {t("formHasErrors", {
                    count: errorCount,
                    plural: errorCount === 1 ? "one" : "other",
                  })}
                </span>
              </div>
            )}
            <Button
              type="submit"
              form="settings-form"
              disabled={isSaving}
              size="sm"
            >
              {isSaving && <Spinner />}
              {isSaving ? t("saving") : t("saveSettings")}
            </Button>
          </div>
        }
      />
      <form
        id="settings-form"
        onSubmit={handleSubmit(onSubmit, onInvalidSubmit)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 p-4 pb-0">
          <div className="relative mb-4">
            <IconSearch className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              type="text"
              placeholder={t("searchSettings")}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
              }}
              className="pr-9 pl-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                }}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
              >
                <IconX className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <SettingsFormProvider form={form} lockedSettings={lockedKeys}>
          <SearchContext.Provider
            value={{
              query: searchQuery,
              isMatch,
            }}
          >
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                void setActiveTab(value as Tab)
              }}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4"
            >
              <TabsList className="scrollbar-hidden max-w-full shrink-0 overflow-x-auto">
                {filteredTabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="gap-1.5"
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/*the p-px is really important, otherwise the ring of the cards gets cut off*/}
              <div className="min-h-0 flex-1 overflow-y-auto p-px pb-4">
                <LibraryTab />
                <TranscriptionTab />
                <AuthTab />
                <UploadTab maxUploadChunkSize={maxUploadChunkSize} />
                <EmailTab />
                <OpdsTab />
                <ChangelogTab currentVersion={currentVersion} />
              </div>
            </Tabs>
          </SearchContext.Provider>
        </SettingsFormProvider>
      </form>
      {lockedKeys.size > 0 && (
        <div className="absolute right-0 bottom-0 left-0 flex items-center gap-2 bg-amber-600/10 p-3 text-xs dark:bg-amber-600/20">
          <IconAlertCircle className="h-4 w-4 text-amber-500" />
          <span className="text-amber-500">{t("lockedSettings")}</span>
        </div>
      )}
    </div>
  )
}
