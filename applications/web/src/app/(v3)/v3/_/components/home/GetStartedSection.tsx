"use client"

import { useState } from "react"
import { toast } from "sonner"

import { ImportBookDialog } from "@v3/_/components/books/ImportBookDialog"
import { UploadBookDialog } from "@v3/_/components/books/UploadBookDialog"
import { ShelfEditor } from "@v3/_/components/shelves/ShelfEditor"
import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { useIsTauri } from "@/app/(v3)/v3/_/hooks/use-is-tauri"
import { useBookInSidePanel } from "@/app/(v3)/v3/_/hooks/use-open-book"
import { type HomeSectionWithDetails } from "@/database/shelves"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"
import {
  useGetUserSettingsQuery,
  useSetUserSettingRawMutation,
  useUpdateHomeSectionMutation,
} from "@/store/api"

const FAREWELL_SEEN_KEY = "onboarding.getStartedFarewellSeen"

export function GetStartedSection({
  section,
}: {
  section: HomeSectionWithDetails
}) {
  const t = useTranslation("HomePage")
  const isTauri = useIsTauri()
  const permissions = usePermissions()
  const canCreate = !!permissions?.bookCreate
  const canUpdateSettings = !!permissions?.settingsUpdate

  const { setSelectedBookUuid } = useBookInSidePanel()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [shelfOpen, setShelfOpen] = useState(false)

  const [updateHomeSection] = useUpdateHomeSectionMutation()
  const [setUserSettingRaw] = useSetUserSettingRawMutation()
  const { data: settings } = useGetUserSettingsQuery()
  const farewellSeen = !!(settings as Record<string, unknown> | undefined)?.[
    FAREWELL_SEEN_KEY
  ]

  const handleDismiss = () => {
    void updateHomeSection({ uuid: section.uuid, enabled: false })

    if (!farewellSeen) {
      void setUserSettingRaw({ name: FAREWELL_SEEN_KEY, value: true })
      toast(t("getStarted.farewell.title"), {
        description: t("getStarted.farewell.body"),
        duration: 8000,
      })
    }
  }

  return (
    <Card className="bg-muted/40">
      <CardHeader>
        <CardTitle className="font-heading text-lg font-medium">
          {t("getStarted.title")}
        </CardTitle>
        <CardDescription>{t("getStarted.description")}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            <icon.Close className="mr-1 size-4" />
            {t("getStarted.dismiss")}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-wrap gap-2">
        {canCreate && !isTauri && (
          <Button
            variant="default"
            onClick={() => {
              setUploadOpen(true)
            }}
          >
            <icon.FileUpload className="mr-2 size-4" />
            {t("getStarted.uploadBook")}
          </Button>
        )}

        {canCreate && (
          <Button
            variant={isTauri ? "default" : "outline"}
            onClick={() => {
              setImportOpen(true)
            }}
          >
            <icon.FileImport className="mr-2 size-4" />
            {t("getStarted.importBook")}
          </Button>
        )}

        <Button
          variant="outline"
          onClick={() => {
            setShelfOpen(true)
          }}
        >
          <icon.Add className="mr-2 size-4" />
          {t("getStarted.createShelf")}
        </Button>

        {canUpdateSettings && (
          <Button
            variant="ghost"
            nativeButton={false}
            render={
              <V3Link href="/settings?tab=library">
                <icon.ExternalLink className="mr-2 size-4" />
                {t("getStarted.importSettings")}
              </V3Link>
            }
          />
        )}
      </CardContent>

      <UploadBookDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onBookCreated={(bookUuid) => {
          void setSelectedBookUuid(bookUuid)
        }}
      />

      <ImportBookDialog open={importOpen} onOpenChange={setImportOpen} />

      <ShelfEditor open={shelfOpen} onOpenChange={setShelfOpen} shelf={null} />
    </Card>
  )
}
