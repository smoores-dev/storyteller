"use client"

import { IconEye, IconEyeOff, IconLoader } from "@tabler/icons-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { type ChangelogEntry } from "@/database/changelog"
import { api, useGetLatestVersionQuery } from "@/store/api"
import { BETA_TAGS, compareVersions } from "@/versions"

import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { TabsContent } from "@v3/_/components/ui/tabs"

export const DISMISSED_VERSION_KEY = "storyteller_dismissed_changelog_version"

function formatDate(dateString: string): string {
  const date = new Date(dateString)

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function ChangelogEntryCard({
  entry,
  currentVersion,
}: {
  entry: ChangelogEntry
  currentVersion: string
}) {
  const v = compareVersions(entry.version, currentVersion)

  const descriptionWithoutHeader = entry.description
    ?.replace(/<h2+ .*<\/h2>/gm, "")
    .replaceAll('href="/', 'href="https://gitlab.com/')

  const t = useTranslations("SettingsPage.changelog")

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-base">
            v{entry.version}
            {v === 0 ? (
              <Badge variant="outline" className="bg-st-orange-200">
                {t("current")}
              </Badge>
            ) : v === 1 ? (
              <Badge variant="outline" className="bg-green-100 text-green-500">
                {t("new")}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription className="shrink-0 text-xs">
            {formatDate(entry.releasedAt)}
          </CardDescription>
        </div>
      </CardHeader>

      {descriptionWithoutHeader && descriptionWithoutHeader !== "null\n" && (
        <CardContent>
          <div
            className="prose prose-sm dark:prose-invert [&_a]:text-primary max-w-none [&_h2]:mt-0 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-0 [&_h3]:text-xs [&_h3]:font-medium [&_li]:my-0 [&_p]:my-1 [&_ul]:my-1"
            dangerouslySetInnerHTML={{
              __html: descriptionWithoutHeader,
            }}
          />
        </CardContent>
      )}
    </Card>
  )
}

export function ChangelogTab({ currentVersion }: { currentVersion: string }) {
  const { fetchNextPage, data, isFetching, hasNextPage } =
    api.endpoints.getInfiniteChangelog.useInfiniteQuery("web")

  const t = useTranslations("SettingsPage.changelog")

  const { data: latestVersionData } = useGetLatestVersionQuery({
    component: "web",
  })

  const isBeta = BETA_TAGS.some((tag) =>
    latestVersionData?.version?.includes(tag),
  )
  const [showBeta, setShowBeta] = useState(isBeta)

  const filteredData =
    data?.pages.flat().filter((entry) => {
      if (showBeta) return true
      return !BETA_TAGS.some((tag) => entry.version.includes(tag))
    }) ?? []

  useEffect(() => {
    if (!latestVersionData?.version) return

    localStorage.setItem(DISMISSED_VERSION_KEY, latestVersionData.version)
  }, [latestVersionData])

  return (
    <TabsContent value="changelog" className="relative flex flex-col gap-4">
      <div className="bg-background sticky -top-2 z-10 flex flex-col gap-2 py-2 md:flex-row md:items-center md:justify-between">
        <p>
          {t("currentlyOn", {
            version: currentVersion,
            latest: latestVersionData?.version ?? "unknown",
          })}
        </p>
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            setShowBeta(!showBeta)
          }}
        >
          {showBeta ? <IconEyeOff /> : <IconEye />}
          {showBeta ? t("hideBetaVersions") : t("showBetaVersions")}
        </Button>
      </div>

      {filteredData.map((entry) => (
        <ChangelogEntryCard
          key={entry.tagName}
          entry={entry}
          currentVersion={currentVersion}
        />
      ))}

      {isFetching && (
        <div className="flex justify-center py-4">
          <IconLoader className="text-muted-foreground size-5 animate-spin" />
        </div>
      )}

      {!isFetching && filteredData.length === 0 && (
        <div className="text-muted-foreground py-8 text-center text-sm">
          {t("noChangelogEntriesFound")}
        </div>
      )}

      {hasNextPage && !isFetching && filteredData.length > 0 && (
        <div className="flex justify-center py-2">
          <Button variant="outline" size="sm" onClick={fetchNextPage}>
            {t("loadMore")}
          </Button>
        </div>
      )}
    </TabsContent>
  )
}
