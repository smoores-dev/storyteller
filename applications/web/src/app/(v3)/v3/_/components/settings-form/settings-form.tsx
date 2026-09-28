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
  NavSidebarEmpty,
  NavSidebarGroup,
  NavSidebarHeader,
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

import {
  type Invite,
  type ServerCapabilities,
  type Settings,
  type User,
} from "@/apiModels"
import { useIsTauri } from "@/app/(v3)/v3/_/hooks/use-is-tauri"
import { cn } from "@/cn"
import { SettingsSchema } from "@/database/settingsTypes"
import { useInitialData } from "@/hooks/useInitialData"
import * as icon from "@/icons"
import {
  api,
  useGetMaxUploadChunkSizeQuery,
  useUpdateSettingsMutation,
} from "@/store/api"

import {
  type SettingsFormForm,
  SettingsFormProvider,
} from "./SettingsFormProvider"
import { BackupsTab } from "./backups-tab"
import { ChangelogTab } from "./changelog-tab"
import { FilesPage } from "./files-page"
import { LogsTab } from "./logs-tab"
import { MaintenanceTab } from "./maintenance-tab"
import { MetadataPage } from "./metadata-page"
import { ProcessingPage } from "./processing-page"
import { QueueTab } from "./queue-tab"
import { ServerPage } from "./server-page"
import { type IsMatch, SearchContext } from "./shared"
import { TAB_ICONS } from "./tab-icons"
import {
  type AdminTab,
  SETTINGS_SECTIONS,
  type SectionKeywords,
  type SettingsPage,
  type SettingsSectionDef,
  type Tab,
  adminTabs,
  isSectionOnPlatform,
  resolveTab,
  sectionsForPage,
  settingsPages,
  tabs as allTabValues,
} from "./tabs"
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
    ctcModel:
      settings.ctcModel && isCtcModelFamily(settings.ctcModel)
        ? settings.ctcModel
        : null,
    ctcServerUrl: settings.ctcServerUrl ?? "",
    ctcServerApiKey: settings.ctcServerApiKey ?? "",
    whisperServerUrl: settings.whisperServerUrl ?? "",
    whisperServerApiKey: settings.whisperServerApiKey ?? "",
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
  capabilities,
  currentVersion,
  initialUsers,
  initialInvites,
}: {
  settings: Settings
  sectionKeywords: SectionKeywords
  configLockedKeys: (keyof Settings)[]
  capabilities: ServerCapabilities
  currentVersion: string
  initialUsers?: User[]
  initialInvites?: Invite[]
}) {
  useInitialData(
    api.util.upsertQueryData("getServerCapabilities", undefined, capabilities),
  )
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
  const { dirtyFields, isDirty } = formState

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
      allTabValues
        .filter((tab) => tab !== "users" || hasUsers)
        .map((tab) => ({
          value: tab,
          label: t.plain(`tabs.${tab}.title`),
          icon: TAB_ICONS[tab],
        })),
    [t, hasUsers],
  )

  const searchParams = useSearchParams()

  const [activeTabRaw, setActiveTab] = useQueryState(
    "tab",
    parseAsString.withOptions({ history: "push" }) as SingleParser<Tab>,
  )
  const setActiveTabEvent = useEffectEvent((tab: Tab) => {
    void setActiveTab(tab)
  })

  const canonicaliseTabEvent = useEffectEvent((tab: Tab | null) => {
    void setActiveTab(tab, { history: "replace" })
  })

  useEffect(() => {
    const searchTab = resolveTab(searchParams.get("tab"))
    if (searchTab !== activeTabRaw) {
      canonicaliseTabEvent(searchTab)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const [targetSection, setTargetSection] = useQueryState(
    "section",
    parseAsString.withOptions({ history: "replace" }),
  )
  const clearTargetSectionEvent = useEffectEvent(() => {
    void setTargetSection(null)
  })

  useEffect(() => {
    if (!targetSection) return

    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`settings-${targetSection}`)
      if (!element) return

      element.scrollIntoView({ block: "start" })
      clearTargetSectionEvent()
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [targetSection, activeTabRaw])

  const resolvedTab = resolveTab(activeTabRaw)
  const activeTab = isMobile ? resolvedTab : (resolvedTab ?? "files")
  const showMobileSidebar = isMobile && !activeTab

  const matchingSections = useMemo(() => {
    const query = searchQuery.toLowerCase()
    if (!query) return null

    return new Set<string>(
      SETTINGS_SECTIONS.filter(
        (section) =>
          isSectionOnPlatform(section, isTauri) &&
          sectionKeywords[section.id]?.some((keyword) =>
            keyword.toLowerCase().includes(query),
          ),
      ).map((section) => section.id),
    )
  }, [searchQuery, sectionKeywords, isTauri])

  const matchingTabs = useMemo(() => {
    if (!matchingSections) return new Set<Tab>(allTabs.map((tab) => tab.value))

    const query = searchQuery.toLowerCase()
    const sectionPages = new Set<Tab>(
      SETTINGS_SECTIONS.filter((section) =>
        matchingSections.has(section.id),
      ).map((section) => section.page),
    )
    return new Set<Tab>(
      allTabs
        .filter(
          (tab) =>
            sectionPages.has(tab.value) ||
            tab.label.toLowerCase().includes(query),
        )
        .map((tab) => tab.value),
    )
  }, [matchingSections, allTabs, searchQuery])

  const isMatch: IsMatch = (section) =>
    !matchingSections || matchingSections.has(section)

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

  const filteredTabs = allTabs.filter((tab) => matchingTabs.has(tab.value))

  const isFormTab = settingsPages.includes(activeTab as SettingsPage)
  const activeTabDef = allTabs.find((tab) => tab.value === activeTab)

  const railSections = useMemo(
    () =>
      isFormTab && activeTab
        ? sectionsForPage(activeTab, isTauri).filter(
            (section) => !matchingSections || matchingSections.has(section.id),
          )
        : [],
    [isFormTab, activeTab, isTauri, matchingSections],
  )

  const tabContent = (
    <>
      <DocumentTitle parts={[activeTabDef?.label, title]} />
      {activeTab === "files" && <FilesPage />}
      {activeTab === "metadata" && <MetadataPage />}
      {activeTab === "processing" && <ProcessingPage />}
      {activeTab === "server" && (
        <ServerPage maxUploadChunkSize={maxUploadChunkSize} />
      )}
      {activeTab === "users" && initialUsers && initialInvites && (
        <UsersTab
          initialUsers={initialUsers}
          initialInvites={initialInvites}
          disablePasswordLogin={settings.disablePasswordLogin}
        />
      )}
      {activeTab === "changelog" && (
        <ChangelogTab currentVersion={currentVersion} />
      )}
      {activeTab === "maintenance" && <MaintenanceTab />}
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
            disabled={isSaving || !isDirty}
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
      capabilities={capabilities}
    >
      <SearchContext.Provider
        value={{ query: searchQuery, isMatch, targetSection }}
      >
        {isFormTab ? (
          <form
            id="settings-form"
            onSubmit={handleSubmit(onSubmit, onInvalidSubmit)}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <PageContent className="p-4">
              <div className="flex gap-8">
                <div className="min-w-0 flex-1">{tabContent}</div>
                <SectionRail sections={railSections} />
              </div>
            </PageContent>
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
                    disabled={isSaving || !isDirty}
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

function SectionRail({
  sections,
}: {
  sections: readonly SettingsSectionDef[]
}) {
  const t = useTranslation("SettingsPage")
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(new Set())
  const sectionIds = sections.map((section) => section.id).join(",")

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      setVisibleIds((prev) => {
        const next = new Set(prev)
        for (const entry of entries) {
          if (entry.isIntersecting) next.add(entry.target.id)
          else next.delete(entry.target.id)
        }
        return next
      })
    })

    for (const id of sectionIds.split(",")) {
      const element = document.getElementById(`settings-${id}`)
      if (element) observer.observe(element)
    }

    return () => {
      observer.disconnect()
    }
  }, [sectionIds])

  if (sections.length < 2) return null

  return (
    <nav className="sticky top-0 hidden h-fit w-44 shrink-0 self-start lg:block">
      <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
        {t("onThisPage")}
      </p>
      <ul className="flex flex-col gap-0.5">
        {sections.map((section) => (
          <li key={section.id}>
            <button
              type="button"
              className={cn(
                "text-muted-foreground hover:text-foreground w-full truncate rounded px-1.5 py-1 text-left text-xs",
                visibleIds.has(`settings-${section.id}`) && "text-foreground",
              )}
              onClick={() => {
                document
                  .getElementById(`settings-${section.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
            >
              {t.plain(
                `tabs.${section.page}.sections.${section.key}.title` as never,
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
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

  const settingsTabs = tabs.filter((tab) =>
    settingsPages.includes(tab.value as SettingsPage),
  )
  const administrationTabs = tabs.filter((tab) =>
    adminTabs.includes(tab.value as AdminTab),
  )

  return (
    <NavSidebar>
      <NavSidebarHeader
        title={t("title")}
        link={{
          href: "/preferences?tab=general",
          icon: icon.Settings2,
          label: t("preferences"),
        }}
      />

      <NavSidebarBody className="pt-0">
        <NavSidebarSearch
          placeholder={t("searchSettings")}
          value={searchQuery}
          onChange={onSearchChange}
        />

        {settingsTabs.length > 0 && (
          <NavSidebarGroup label={t("sidebar.settings")}>
            <NavSidebarList
              tabs={settingsTabs}
              activeTab={activeTab}
              onTabChange={onTabChange}
            />
          </NavSidebarGroup>
        )}

        {administrationTabs.length > 0 && (
          <NavSidebarGroup label={t("sidebar.administration")}>
            <NavSidebarList
              tabs={administrationTabs}
              activeTab={activeTab}
              onTabChange={onTabChange}
            />
          </NavSidebarGroup>
        )}

        {tabs.length === 0 && (
          <NavSidebarEmpty>{t("sidebar.noMatches")}</NavSidebarEmpty>
        )}
      </NavSidebarBody>
    </NavSidebar>
  )
}
