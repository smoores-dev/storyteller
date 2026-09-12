"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { type Locale } from "next-intl"
import { type SingleParser, parseAsString, useQueryState } from "nuqs"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { type z } from "zod"

import { changeLocaleAction } from "@v3/_/actions/changeLocaleAction"
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
import { useIsMobile } from "@v3/_/hooks/use-mobile"
import { applyServerErrors } from "@v3/_/lib/form-errors"

import { type User } from "@/apiModels"
import {
  useCommon,
  useTranslation,
} from "@/app/(v3)/v3/_/hooks/use-translation"
import {
  type PreferenceDefaults,
  type UserPreferencesForm,
  UserPreferencesFormSchema,
  formUserPreferences,
} from "@/database/userPreferencesTypes"
import { usePermission } from "@/hooks/usePermission"
import * as icon from "@/icons"
import { useUpdateUserSettingsMutation } from "@/store/api"

import { AppearanceTab } from "./appearance-tab"
import { BooksTab } from "./books-tab"
import { GeneralTab } from "./general-tab"
import { LibraryDefaultsProvider } from "./library-defaults"
import { ProfileTab } from "./profile-tab"
import { type IsMatch, SearchContext } from "./shared"
import { type PreferenceTab, type SectionKeywords, type Tab } from "./tabs"

const SIDEBAR_WIDTH = 200

const formTabs: Tab[] = ["general", "appearance", "books"]
const userTabs: Tab[] = ["profile"]

type SidebarTabDef = NavSidebarTab<Tab>

export function PreferencesForm({
  user,
  preferences,
  sectionKeywords,
  linkedAccounts,
  providers,
  disablePasswordLogin,
  preferenceDefaults,
  preferenceDefaultsLocked,
}: {
  user: User
  preferences: UserPreferencesForm
  sectionKeywords: SectionKeywords
  linkedAccounts: Array<{ provider: string; providerAccountId: string }>
  providers: Array<{ id: string; name: string }>
  disablePasswordLogin: boolean
  preferenceDefaults: PreferenceDefaults
  preferenceDefaultsLocked: boolean
}) {
  const t = useTranslation("PreferencesPage")
  const c = useCommon()
  const canUpdateSettings = usePermission("settingsUpdate")
  const isMobile = useIsMobile()

  const form = useForm({
    resolver: zodResolver(UserPreferencesFormSchema),
    defaultValues: preferences,
  })

  const [updateSettings, { isLoading: isSaving }] =
    useUpdateUserSettingsMutation()

  const onSubmit = async (data: z.output<typeof UserPreferencesFormSchema>) => {
    const changed = Object.keys(
      form.formState.dirtyFields,
    ) as (keyof UserPreferencesForm)[]

    if (changed.length === 0) {
      toast.success(t("savedSuccessfully"))
      return
    }

    const payload = Object.fromEntries(
      changed.map((key) => [key, data[key]]),
    ) as Partial<UserPreferencesForm>

    try {
      const saved = await updateSettings(payload).unwrap()

      if (changed.includes("locale") && data.locale) {
        await changeLocaleAction(data.locale as Locale)
      }

      form.reset(formUserPreferences(saved))
      toast.success(t("savedSuccessfully"))
    } catch (error) {
      toast.error(applyServerErrors(form, error, t("failedToSave")))
    }
  }

  const onInvalid = () => {
    toast.error(t("failedToSave"))
  }

  const allTabs = useMemo<SidebarTabDef[]>(
    () => [
      { value: "profile", label: t("tabs.profile.title"), icon: icon.User },
      {
        value: "general",
        label: t("tabs.general.title"),
        icon: icon.Settings2,
      },
      {
        value: "appearance",
        label: t("tabs.appearance.title"),
        icon: icon.Palette,
      },
      { value: "books", label: t("tabs.books.title"), icon: icon.BookAlt },
    ],
    [t],
  )

  const [activeTabRaw, setActiveTab] = useQueryState(
    "tab",
    parseAsString as SingleParser<Tab>,
  )

  const activeTab: Tab | null = isMobile
    ? activeTabRaw
    : (activeTabRaw ?? "profile")
  const showMobileSidebar = isMobile && !activeTab

  const setActiveTabEvent = useCallback(
    (tab: Tab) => {
      void setActiveTab(tab)
    },
    [setActiveTab],
  )

  const [searchQuery, setSearchQuery] = useState("")

  const matchingSections = useMemo(() => {
    if (!searchQuery) return null

    const query = searchQuery.toLowerCase()
    const matching = new Set<string>()

    for (const [tab, sections] of Object.entries(sectionKeywords)) {
      for (const [section, keywords] of Object.entries(sections)) {
        if (keywords.some((kw) => kw.toLowerCase().includes(query))) {
          matching.add(`${tab}.${section}`)
        }
      }
    }

    return matching
  }, [searchQuery, sectionKeywords])

  const matchingTabs = useMemo(() => {
    if (!matchingSections) return null

    return new Set<PreferenceTab>(
      Array.from(matchingSections).map(
        (key) => key.split(".")[0] as PreferenceTab,
      ),
    )
  }, [matchingSections])

  const isMatch: IsMatch = (tab, section) =>
    !matchingSections || matchingSections.has(`${tab}.${section}`)

  const prefActiveTab = useRef<string>(activeTab)
  prefActiveTab.current = activeTab

  useEffect(() => {
    if (!matchingTabs) return

    const firstMatch = Array.from(matchingTabs)[0]

    if (
      firstMatch &&
      !matchingTabs.has(prefActiveTab.current as PreferenceTab)
    ) {
      void setActiveTab(firstMatch)
    }
  }, [matchingTabs, setActiveTab])

  const filteredTabs = matchingTabs
    ? allTabs.filter(
        (tab) =>
          userTabs.includes(tab.value) ||
          matchingTabs.has(tab.value as PreferenceTab),
      )
    : allTabs

  const activeTabDef = allTabs.find((t) => t.value === activeTab)
  const showSaveButton = activeTab !== "profile"

  const tabContent = (
    <LibraryDefaultsProvider
      form={form}
      canManage={canUpdateSettings ?? false}
      locked={preferenceDefaultsLocked}
      defaults={preferenceDefaults}
    >
      {activeTab === "profile" && (
        <ProfileTab
          user={user}
          linkedAccounts={linkedAccounts}
          providers={providers}
          disablePasswordLogin={disablePasswordLogin}
        />
      )}
      {activeTab === "general" && <GeneralTab form={form} />}
      {activeTab === "appearance" && <AppearanceTab form={form} />}
      {activeTab === "books" && <BooksTab form={form} />}
    </LibraryDefaultsProvider>
  )

  const headerActions = (
    <div className="flex items-center gap-3">
      {showSaveButton && (
        <Button
          type="submit"
          form="preferences-form"
          disabled={isSaving}
          size="sm"
        >
          {isSaving && <Spinner />}
          {isSaving ? c("states.saving") : c("actions.save")}
        </Button>
      )}
    </div>
  )

  const sidebarContent = (
    <PreferencesSidebar
      tabs={filteredTabs}
      activeTab={activeTab}
      onTabChange={setActiveTabEvent}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      canUpdateSettings={canUpdateSettings ?? false}
    />
  )

  const isFormTab = formTabs.includes(activeTab as PreferenceTab)

  const contentArea = (
    <SearchContext.Provider value={{ query: searchQuery, isMatch }}>
      {isFormTab ? (
        <form
          id="preferences-form"
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <PageContent className="p-4">{tabContent}</PageContent>
        </form>
      ) : (
        <PageContent className="p-4">{tabContent}</PageContent>
      )}
    </SearchContext.Provider>
  )

  if (isMobile) {
    if (showMobileSidebar) {
      return (
        <div className="flex h-screen flex-col overflow-hidden">
          <PageHeader>
            <SiteHeader
              breadcrumbs={[
                { label: t("title") },
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

                  {showSaveButton && (
                    <Button
                      type="submit"
                      form="preferences-form"
                      disabled={isSaving}
                      size="sm"
                    >
                      {isSaving && <Spinner />}
                      {isSaving ? c("states.saving") : c("actions.save")}
                    </Button>
                  )}
                </div>
              }
            />
          </PageHeader>

          {contentArea}
        </div>
      )
    }

    return (
      <div className="flex h-screen flex-col">
        <PageHeader>
          <SiteHeader breadcrumbs={[{ label: t("title") }]} />
        </PageHeader>

        <div className="flex-1 overflow-y-auto">{sidebarContent}</div>
      </div>
    )
  }

  return (
    <PageLayout>
      <PageSidebar width={SIDEBAR_WIDTH}>{sidebarContent}</PageSidebar>

      <PageMain>
        <PageHeader>
          <SiteHeader
            breadcrumbs={[
              {
                render: (
                  <h1 className="font-heading text-foreground truncate text-lg font-medium">
                    {activeTabDef?.label ?? t("title")}
                  </h1>
                ),
              },
            ]}
            actions={headerActions}
          />
        </PageHeader>

        {contentArea}
      </PageMain>
    </PageLayout>
  )
}

function PreferencesSidebar({
  tabs,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  canUpdateSettings,
}: {
  tabs: SidebarTabDef[]
  activeTab: Tab | null
  onTabChange: (tab: Tab) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  canUpdateSettings: boolean
}) {
  const t = useTranslation("PreferencesPage")
  const userSidebarTabs = tabs.filter((tab) => userTabs.includes(tab.value))
  const prefSidebarTabs = tabs.filter((tab) => formTabs.includes(tab.value))

  return (
    <NavSidebar>
      <NavSidebarBody>
        {userSidebarTabs.length > 0 && (
          <NavSidebarGroup label={t("sidebar.user")}>
            <NavSidebarList
              tabs={userSidebarTabs}
              activeTab={activeTab}
              onTabChange={onTabChange}
            />
          </NavSidebarGroup>
        )}

        <NavSidebarGroup label={t("sidebar.preferences")}>
          <NavSidebarSearch
            placeholder={t("searchPreferences")}
            value={searchQuery}
            onChange={onSearchChange}
          />

          <NavSidebarList
            tabs={prefSidebarTabs}
            activeTab={activeTab}
            onTabChange={onTabChange}
          />
        </NavSidebarGroup>
      </NavSidebarBody>

      {canUpdateSettings && (
        <NavSidebarFooterLink
          href="/settings?tab=library"
          icon={icon.Settings}
          label={t("settingsPage")}
        />
      )}
    </NavSidebar>
  )
}
