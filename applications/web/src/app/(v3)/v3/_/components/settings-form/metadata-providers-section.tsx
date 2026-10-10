"use client"

import { type ReactNode, useState } from "react"
import { useWatch } from "react-hook-form"

import { type BookMetadataProvider } from "@storyteller-platform/nodekit/types"

import { Button } from "@v3/_/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@v3/_/components/ui/field"
import { InfoTip } from "@v3/_/components/ui/info-tip"
import { Input } from "@v3/_/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { Spinner } from "@v3/_/components/ui/spinner"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { SourceIcon } from "@/app/(v3)/v3/_/components/metadata/source-icon"
import { type ProviderTokenStatus } from "@/database/providerTokens"
import { PROVIDER_LABELS } from "@/externalSource"
import * as icon from "@/icons"
import { MATCH_CONFIDENCES } from "@/metadata/match"
import {
  useClearHardcoverTokenMutation,
  useGetMetadataProvidersQuery,
  useSetHardcoverTokenMutation,
} from "@/store/api"

import { useSettingsForm } from "./SettingsFormProvider"
import { SettingsCard, SettingsSection } from "./shared"

const THRESHOLD_CHOICES = MATCH_CONFIDENCES.filter(
  (confidence) => confidence !== "low",
)

function ThresholdField({ provider }: { provider: BookMetadataProvider }) {
  const t = useTranslation(
    "SettingsPage.tabs.metadata.sections.metadataProviders",
  )
  const tConfidence = useTranslation(
    "BookDetailsPage.metadataImport.confidence",
  )
  const { form } = useSettingsForm()
  const thresholds = useWatch({
    control: form.control,
    name: "metadataAutoImportThresholds",
  })
  const id = `${provider}AutoImportThreshold`
  const items = THRESHOLD_CHOICES.map((confidence) => ({
    value: confidence,
    label: tConfidence.plain(confidence),
  }))

  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id}>
        {t("thresholdLabel")}
        <InfoTip>{t("thresholdTip")}</InfoTip>
      </FieldLabel>
      <Select
        value={thresholds[provider]}
        items={items}
        onValueChange={(value) => {
          if (!value) return
          form.setValue(
            "metadataAutoImportThresholds",
            { ...thresholds, [provider]: value },
            { shouldDirty: true },
          )
        }}
      >
        <SelectTrigger id={id} className="ml-auto w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function HardcoverStatus({ status }: { status: ProviderTokenStatus }) {
  const t = useTranslation(
    "SettingsPage.tabs.metadata.sections.metadataProviders",
  )

  if (status.unreadable && status.source !== "config") {
    return (
      <span className="text-destructive text-xs">{t("tokenUnreadable")}</span>
    )
  }

  if (!status.source) {
    return (
      <span className="text-muted-foreground text-xs">{t("tokenMissing")}</span>
    )
  }

  const label = {
    database: t("tokenSaved"),
    config: t("tokenFromConfig"),
    env: t("tokenFromEnv"),
  }[status.source]

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      <icon.Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      {label}
    </span>
  )
}

function ProviderRow({
  icon: providerIcon,
  name,
  status,
  children,
}: {
  icon: ReactNode
  name: string
  status: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {providerIcon}
        <span className="text-foreground text-xs font-medium">{name}</span>
        <span className="ml-auto">{status}</span>
      </div>
      {children}
    </div>
  )
}

export function MetadataProvidersSection() {
  const t = useTranslation(
    "SettingsPage.tabs.metadata.sections.metadataProviders",
  )
  const c = useCommon()
  const { data, isLoading } = useGetMetadataProvidersQuery()
  const [setToken, { isLoading: isSaving, error: saveError, reset }] =
    useSetHardcoverTokenMutation()
  const [clearToken, { isLoading: isClearing }] =
    useClearHardcoverTokenMutation()
  const [draft, setDraft] = useState("")

  const saveDraft = () => {
    if (!draft.trim()) return
    void setToken(draft.trim())
      .unwrap()
      .then(() => {
        setDraft("")
      })
      .catch(() => {})
  }

  const hardcover = data?.hardcover
  const saveFailed = !!saveError
  const tokenRejected =
    saveError !== undefined &&
    "data" in saveError &&
    (saveError.data as { code?: string } | undefined)?.code === "unauthorized"
  const ready = (
    <span className="text-muted-foreground text-xs">{t("noTokenNeeded")}</span>
  )

  return (
    <SettingsSection id="metadataProviders">
      <SettingsCard
        title={t("title")}
        description={t("description")}
        tip={t("tip")}
      >
        {isLoading ? (
          <Spinner />
        ) : !data?.available ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <icon.AlertTriangle className="size-3.5" />
            {t("unavailable")}
            <InfoTip>{t("unavailableTip")}</InfoTip>
          </p>
        ) : (
          <div className="divide-border divide-y rounded-md border">
            <ProviderRow
              icon={<SourceIcon provider="audnexus" />}
              name={PROVIDER_LABELS.audnexus}
              status={ready}
            >
              <ThresholdField provider="audnexus" />
            </ProviderRow>
            <ProviderRow
              icon={<icon.Image className="text-muted-foreground size-4" />}
              name={PROVIDER_LABELS.apple}
              status={ready}
            />
            <ProviderRow
              icon={<SourceIcon provider="hardcover" />}
              name={PROVIDER_LABELS.hardcover}
              status={hardcover && <HardcoverStatus status={hardcover} />}
            >
              {hardcover && !hardcover.locked && (
                <Field>
                  <FieldLabel htmlFor="hardcoverApiToken">
                    {t("tokenLabel")}
                    <InfoTip>{t("tokenTip")}</InfoTip>
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id="hardcoverApiToken"
                      type="password"
                      autoComplete="off"
                      value={draft}
                      placeholder={
                        hardcover.source === "database"
                          ? t("tokenReplacePlaceholder")
                          : t("tokenPlaceholder")
                      }
                      onChange={(event) => {
                        setDraft(event.target.value)
                        reset()
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return
                        event.preventDefault()
                        saveDraft()
                      }}
                      aria-invalid={saveFailed}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!draft.trim() || isSaving}
                      onClick={saveDraft}
                    >
                      {isSaving && <Spinner className="size-3.5" />}
                      {c("actions.save")}
                    </Button>
                    {(hardcover.source === "database" ||
                      hardcover.unreadable) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isClearing}
                        onClick={() => {
                          void clearToken()
                        }}
                      >
                        {c("actions.remove")}
                      </Button>
                    )}
                  </div>
                  {saveFailed && (
                    <FieldDescription className="text-destructive">
                      {tokenRejected
                        ? t("tokenRejected")
                        : t("tokenUnverified")}
                    </FieldDescription>
                  )}
                </Field>
              )}
              <ThresholdField provider="hardcover" />
            </ProviderRow>
          </div>
        )}
      </SettingsCard>
    </SettingsSection>
  )
}
