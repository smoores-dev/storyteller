"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { type SingleParser, parseAsString, useQueryState } from "nuqs"
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { type FieldErrors, useForm } from "react-hook-form"
import { toast } from "sonner"
import { type z } from "zod"

import { isCtcModelFamily } from "@storyteller-platform/ghost-story/constants"

import { SiteHeader } from "@v3/_/components/site-header"
import { Button } from "@v3/_/components/ui/button"
import {
  NavSidebar,
  NavSidebarBody,
  NavSidebarFooterLink,
  NavSidebarGroup,
  NavSidebarList,
  NavSidebarSearch,
  type NavSidebarTab,
} from "@v3/_/components/ui/nav-sidebar"
import {
  PageContent,
  PageHeader,
  PageLayout,
  PageMain,
  PageSidebar,
} from "@v3/_/components/ui/page-layout"
import { Spinner } from "@v3/_/components/ui/spinner"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { DocumentTitle } from "@v3/_/hooks/use-document-title"
import { useIsMobile } from "@v3/_/hooks/use-mobile"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { applyServerErrors } from "@v3/_/lib/form-errors"

import { type Invite, type Settings, type User } from "@/apiModels"
import { useIsTauri } from "@/app/(v3)/v3/_/hooks/use-is-tauri"
import { SettingsSchema } from "@/database/settingsTypes"
import * as icon from "@/icons"
import {
  useGetMaxUploadChunkSizeQuery,
  useUpdateSettingsMutation,
} from "@/store/api"
import {
  DEFAULT_AUDIO_CHAPTER_SECONDS,
  DEFAULT_DROP_UNREAD,
  DEFAULT_GAP_SECONDS,
} from "@/work/rangeBehaviour"

import {
  type SettingsFormForm,
  SettingsFormProvider,
} from "./SettingsFormProvider"
import { AppTab } from "./app-tab"
import { AuthTab } from "./auth-tab"
import { BackupsTab } from "./backups-tab"
import { ChangelogTab } from "./changelog-tab"
import { EmailTab } from "./email-tab"
import { LibraryTab } from "./library-tab"
import { LogsTab } from "./logs-tab"
import { OpdsTab } from "./opds-tab"
import { ProcessingTab } from "./processing-tab"
import { QueueTab } from "./queue-tab"
import { type IsMatch, SearchContext } from "./shared"
import {
  type AdminTab,
  type DesktopTab,
  type SectionKeywords,
  type SettingsFormTab,
  type Tab,
  adminTabs,
  desktopTabs,
  settingsFormTabs,
} from "./tabs"
import { UploadTab } from "./upload-tab"
import { UsersTab } from "./users-tab"

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

type SettingsTranslations = ReturnType<typeof useTranslation<"SettingsPage">>

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

function settingsFormValues(settings: Settings) {
  return {
    ...settings,
    serverIconSha256: settings.serverIconSha256 ?? null,
    aligner: settings.aligner ?? "whisper",
    alignmentGranularity: settings.alignmentGranularity ?? "sentence",
    alignmentGapSeconds: settings.alignmentGapSeconds ?? DEFAULT_GAP_SECONDS,
    alignmentAudioChapterSeconds:
      settings.alignmentAudioChapterSeconds ?? DEFAULT_AUDIO_CHAPTER_SECONDS,
    alignmentDropUnread: settings.alignmentDropUnread ?? DEFAULT_DROP_UNREAD,
    // TODO: change, if we ever want to use a different CTC engine
    ctcEngine: "wav2vec-local" as const,
    ctcDevice: settings.ctcDevice ?? null,
    ctcModel:
      settings.ctcModel && isCtcModelFamily(settings.ctcModel)
        ? settings.ctcModel
        : null,
    // ctcServerUrl: settings.ctcServerUrl ?? "",
    // ctcServerApiKey: settings.ctcServerApiKey ?? "",
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
    importRules: settings.importRules ?? [],
    autoIgnoreRules: settings.autoIgnoreRules ?? [],
    deleteRuleUuids: [],
  }
}

const SETTINGS_SIDEBAR_WIDTH = 220

type SidebarTabDef = NavSidebarTab<Tab>

export function SettingsForm({
  settings,
  sectionKeywords,
  configLockedKeys,
  currentVersion,
  initialUsers,
  initialInvites,
}: {
  settings: Settings
  sectionKeywords: SectionKeywords
  configLockedKeys: (keyof Settings)[]
  currentVersion: string
  initialUsers?: User[]
  initialInvites?: Invite[]
}) {
  const t = useTranslation("SettingsPage")
  const c = useCommon()
  const title = t("title")
  const isMobile = useIsMobile()
  const isTauri = useIsTauri()
  const { data: maxUploadChunkSize } = useGetMaxUploadChunkSizeQuery()
  const [updateSettings, { isLoading: isSaving }] = useUpdateSettingsMutation()
  const [searchQuery, setSearchQuery] = useState("")
  const lockedKeys = new Set(configLockedKeys)

  const form = useForm({
    resolver: zodResolver(SettingsSchema),
    defaultValues: settingsFormValues(settings),
  })
  const { handleSubmit, formState } = form
  const errorCount = Object.keys(formState.errors).length
  const { dirtyFields } = formState

  const onSubmit = async (data: z.output<typeof SettingsSchema>) => {
    const changed = Object.keys(dirtyFields) as (keyof Settings)[]

    if (changed.length === 0) {
      toast.success(t("settingsSavedSuccessfully"))
      return
    }

    const payload = Object.fromEntries(
      changed.map((key) => [key, data[key]]),
    ) as Partial<Settings>

    try {
      const saved = await updateSettings(payload).unwrap()
      form.reset(settingsFormValues(saved))
      toast.success(t("settingsSavedSuccessfully"))
    } catch (error) {
      toast.error(applyServerErrors(form, error, t("failedToSaveSettings")))
    }
  }

  const onInvalidSubmit = (rawErrors: FieldErrors) => {
    const errors = rawErrors as FieldErrors<z.output<typeof SettingsSchema>>

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
      }),
      {
        description,
      },
    )
  }

  const hasUsers = Boolean(initialUsers)

  const allTabs = useMemo<SidebarTabDef[]>(
    () =>
      [
        { value: "library", label: t("tabs.library.title"), icon: icon.Book },
        {
          value: "processing",
          label: t("tabs.processing.title"),
          icon: icon.Microphone,
        },
        { value: "auth", label: t("tabs.auth.title"), icon: icon.Shield },
        !isTauri && {
          value: "upload" as Tab,
          label: t("tabs.upload.title"),
          icon: icon.Upload,
        },
        { value: "email", label: t("tabs.email.title"), icon: icon.Mail },
        { value: "opds", label: t("tabs.opds.title"), icon: icon.Rss },
        isTauri && {
          value: "app" as Tab,
          label: t("tabs.app.title"),
          icon: icon.System,
        },
        hasUsers && {
          value: "users" as Tab,
          label: t("tabs.users.title"),
          icon: icon.Users,
        },
        {
          value: "changelog",
          label: t("tabs.changelog.title"),
          icon: icon.History,
        },
        { value: "logs", label: t("tabs.logs.title"), icon: icon.FileText },
        {
          value: "queue",
          label: t("tabs.queue.title"),
          icon: icon.ListNumbers,
        },
        {
          value: "backups",
          label: t("tabs.backups.title"),
          icon: icon.Database,
        },
      ].filter(Boolean) as SidebarTabDef[],
    [t, hasUsers, isTauri],
  )

  const searchParams = useSearchParams()

  const [activeTabRaw, setActiveTab] = useQueryState(
    "tab",
    parseAsString.withOptions({ history: "push" }) as SingleParser<Tab>,
  )
  const setActiveTabEvent = useEffectEvent((tab: Tab) => {
    void setActiveTab(tab)
  })

  useEffect(() => {
    const searchTab = searchParams.get("tab")
    if (searchTab !== activeTabRaw) {
      setActiveTabEvent(searchTab as Tab)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const activeTab: Tab | null = isMobile
    ? activeTabRaw
    : (activeTabRaw ?? "library")
  const showMobileSidebar = isMobile && !activeTab

  const matchingSections = useMemo(() => {
    if (!searchQuery) return new Set(allTabs.map((t) => t.value))

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
  }, [searchQuery, allTabs, sectionKeywords])

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
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- pre-existing; these dependencies are left out on purpose
  }, [matchingTabs, searchQuery, setActiveTabEvent])

  const filteredTabs = searchQuery
    ? allTabs.filter(
        (tab) =>
          matchingTabs.has(tab.value) ||
          adminTabs.includes(tab.value as AdminTab),
      )
    : allTabs

  const isFormTab = settingsFormTabs.includes(activeTab as SettingsFormTab)
  const activeTabDef = allTabs.find((t) => t.value === activeTab)

  const tabContent = (
    <>
      <DocumentTitle parts={[activeTabDef?.label, title]} />
      {activeTab === "library" && <LibraryTab />}
      {activeTab === "processing" && <ProcessingTab />}
      {activeTab === "auth" && <AuthTab />}
      {activeTab === "upload" && (
        <UploadTab maxUploadChunkSize={maxUploadChunkSize} />
      )}
      {activeTab === "users" && initialUsers && initialInvites && (
        <UsersTab
          initialUsers={initialUsers}
          initialInvites={initialInvites}
          disablePasswordLogin={settings.disablePasswordLogin}
        />
      )}
      {activeTab === "email" && <EmailTab />}
      {activeTab === "opds" && <OpdsTab />}
      {activeTab === "app" && <AppTab />}
      {activeTab === "changelog" && (
        <ChangelogTab currentVersion={currentVersion} />
      )}
      {activeTab === "logs" && <LogsTab />}
      {activeTab === "queue" && <QueueTab />}
      {activeTab === "backups" && <BackupsTab />}
    </>
  )

  const headerActions = (
    <div className="flex items-center gap-3">
      {isFormTab && (
        <>
          <TooltipButton
            size="sm"
            variant="outline"
            tooltip={t("exportSettings")}
            nativeButton={false}
            aria-label={t("exportSettings")}
            render={
              <Link href="/api/v2/settings" download="storyteller-config.json">
                <icon.Download />
              </Link>
            }
          />

          {errorCount > 0 && (
            <div className="text-destructive flex items-center gap-1.5 text-sm">
              <icon.AlertCircle className="h-4 w-4" />
              <span>
                {t("formHasErrors", {
                  count: errorCount,
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
            {isSaving ? c("states.saving") : t("saveSettings")}
          </Button>
        </>
      )}
    </div>
  )

  const sidebarContent = (
    <SettingsSidebar
      tabs={filteredTabs}
      activeTab={activeTab}
      // oxlint-disable-next-line react-hooks/rules-of-hooks -- passing an Effect Event as a prop; react-hooks v4 permits this
      onTabChange={setActiveTabEvent}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    />
  )

  const contentArea = (
    <SettingsFormProvider
      form={form as SettingsFormForm}
      lockedSettings={lockedKeys}
    >
      <SearchContext.Provider value={{ query: searchQuery, isMatch }}>
        {isFormTab ? (
          <form
            id="settings-form"
            onSubmit={handleSubmit(onSubmit, onInvalidSubmit)}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <PageContent className="p-4">{tabContent}</PageContent>
          </form>
        ) : (
          <PageContent className="p-4">{tabContent}</PageContent>
        )}
      </SearchContext.Provider>
    </SettingsFormProvider>
  )

  if (isMobile) {
    if (showMobileSidebar) {
      return (
        <div className="flex h-screen flex-col">
          <PageHeader>
            <SiteHeader breadcrumbs={[{ label: title }]} />
          </PageHeader>

          {sidebarContent}
        </div>
      )
    }
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <PageHeader>
          <SiteHeader
            breadcrumbs={[
              { label: title },
              ...(activeTabDef ? [{ label: activeTabDef.label }] : []),
            ]}
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void setActiveTab(null)}
                >
                  <icon.ArrowLeft className="mr-1 h-4 w-4" />
                  {c("actions.back")}
                </Button>

                {isFormTab && (
                  <Button
                    type="submit"
                    form="settings-form"
                    disabled={isSaving}
                    size="sm"
                  >
                    {isSaving && <Spinner />}
                    {isSaving ? c("states.saving") : t("saveSettings")}
                  </Button>
                )}
              </div>
            }
          />
        </PageHeader>

        {contentArea}

        {lockedKeys.size > 0 && <LockedSettingsBanner t={t} />}
      </div>
    )
  }

  return (
    <PageLayout>
      <PageSidebar width={SETTINGS_SIDEBAR_WIDTH}>{sidebarContent}</PageSidebar>

      <PageMain>
        <PageHeader>
          <SiteHeader
            breadcrumbs={[
              {
                render: (
                  <h1 className="font-heading text-foreground truncate text-lg font-medium">
                    {activeTabDef?.label ?? title}
                  </h1>
                ),
              },
            ]}
            actions={headerActions}
          />
        </PageHeader>

        {contentArea}

        {lockedKeys.size > 0 && <LockedSettingsBanner t={t} />}
      </PageMain>
    </PageLayout>
  )
}

function LockedSettingsBanner({
  t,
}: {
  t: ReturnType<typeof useTranslation<"SettingsPage">>
}) {
  return (
    <div className="flex items-center gap-2 bg-amber-600/10 p-3 text-xs dark:bg-amber-600/20">
      <icon.AlertCircle className="h-4 w-4 text-amber-500" />
      <span className="text-amber-500">{t("lockedSettings")}</span>
    </div>
  )
}

function SettingsSidebar({
  tabs,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
}: {
  tabs: SidebarTabDef[]
  activeTab: Tab | null
  onTabChange: (tab: Tab) => void
  searchQuery: string
  onSearchChange: (query: string) => void
}) {
  const t = useTranslation("SettingsPage")

  const settingsTabs = tabs.filter(
    (tab) =>
      settingsFormTabs.includes(tab.value as SettingsFormTab) ||
      desktopTabs.includes(tab.value as DesktopTab),
  )
  const administrationTabs = tabs.filter((tab) =>
    adminTabs.includes(tab.value as AdminTab),
  )

  return (
    <NavSidebar>
      <NavSidebarBody>
        <NavSidebarGroup label={t("sidebar.settings")}>
          <NavSidebarSearch
            placeholder={t("searchSettings")}
            value={searchQuery}
            onChange={onSearchChange}
          />

          <NavSidebarList
            tabs={settingsTabs}
            activeTab={activeTab}
            onTabChange={onTabChange}
          />
        </NavSidebarGroup>

        {administrationTabs.length > 0 && (
          <NavSidebarGroup label={t("sidebar.administration")}>
            <NavSidebarList
              tabs={administrationTabs}
              activeTab={activeTab}
              onTabChange={onTabChange}
            />
          </NavSidebarGroup>
        )}
      </NavSidebarBody>

      <NavSidebarFooterLink
        href="/preferences?tab=general"
        icon={icon.Settings2}
        label={t("preferences")}
      />
    </NavSidebar>
  )
}
