"use client"

import { useLocale } from "next-intl"
import { useState } from "react"
import { Controller, useWatch } from "react-hook-form"

import {
  CTC_DTYPES,
  ctcModelLanguages,
} from "@storyteller-platform/ghost-story/constants"

import { Button } from "@v3/_/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@v3/_/components/ui/field"
import { InfoTip } from "@v3/_/components/ui/info-tip"
import { Input } from "@v3/_/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@v3/_/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { Switch } from "@v3/_/components/ui/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@v3/_/components/ui/tabs"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { type ProcessRestart } from "@/app/(v3)/v3/_/components/books/BookDetails/useProcessingRun"
import { MP3_CBR_BITRATE_OPTIONS } from "@/assets/audio/mp3Bitrates"
import { cn } from "@/cn"
import { type ReadaloudLocationType } from "@/database/settingsTypes"
import { usePermissions } from "@/hooks/usePermissions"
import {
  useGetServerCapabilitiesQuery,
  useTestCtcServerMutation,
} from "@/store/api"

import {
  LockTooltip,
  SettingsFormField,
  useSettingsForm,
} from "./SettingsFormProvider"
import { AlignerPicker } from "./aligner-picker"
import {
  AdvancedFields,
  OptionWithHint,
  SettingsCard,
  SettingsLink,
  SettingsSection,
} from "./shared"

const alignerSettingsComponents = {
  whisper: WhisperAlignerSettings,
  ctc: CtcAlignerSettings,
}

const engineSettingsComponents = {
  "whisper.cpp": WhisperSettings,
  "whisper-server": WhisperServerSettings,
  "google-cloud": GoogleCloudSettings,
  "microsoft-azure": AzureSettings,
  "amazon-transcribe": AmazonSettings,
  "openai-cloud": OpenAiSettings,
  deepgram: DeepgramSettings,
}

export function ProcessingSettingsFields({
  collapsible = false,
  restart,
}: {
  collapsible?: boolean
  restart?: ProcessRestart
} = {}) {
  const { form } = useSettingsForm()
  const tt = useTranslation("SettingsPage.tabs.processing.sections.alignment")
  const ta = useTranslation("SettingsPage.tabs.processing.sections.audio")

  const aligner = useWatch({ control: form.control, name: "aligner" })
  const codec = useWatch({ control: form.control, name: "codec" })

  const AlignerSettings = alignerSettingsComponents[aligner ?? "whisper"]

  const trackLengths = [
    { value: 0.75, label: ta("maxTrackLength45") },
    { value: 1, label: ta("maxTrackLength1") },
    { value: 2, label: ta("maxTrackLength2") },
    { value: 3, label: ta("maxTrackLength3") },
    { value: 4, label: ta("maxTrackLength4") },
  ]

  const codecOptions = [
    { value: "default", label: ta("codecDefault") },
    { value: "libopus", label: ta("codecOpus") },
    { value: "libmp3lame", label: ta("codecMp3") },
    { value: "aac", label: ta("codecAac") },
  ]

  const opusBitrateOptions = [
    { value: "", label: ta("bitrateDefault") },
    { value: "16K", label: "16 Kb/s" },
    { value: "24K", label: "24 Kb/s" },
    { value: "32K", label: "32 Kb/s" },
    { value: "64K", label: "64 Kb/s" },
    { value: "96K", label: "96 Kb/s" },
  ]

  const mp3BitrateOptions = [
    { value: "", label: ta("mp3BitrateDefault") },
    ...MP3_CBR_BITRATE_OPTIONS.map(({ value, kbps }) => ({
      value,
      label: `${kbps} kb/s`,
    })),
  ]

  const keepsAnalysis = restart === "sync" || restart === "transcode"
  const showTranscription = !keepsAnalysis
  const showAudio = !restart || restart === "full" || restart === "transcode"

  return (
    <div className="space-y-6">
      <SettingsSection id="alignment">
        <SettingsCard collapsible={collapsible} defaultOpen title={tt("title")}>
          {showTranscription && (
            <SettingsFormField
              name="aligner"
              label={tt("aligner")}
              render={(field, _fieldState, isLocked) => (
                <AlignerPicker
                  value={field.value ?? "whisper"}
                  onChange={field.onChange}
                  disabled={isLocked}
                />
              )}
            />
          )}

          <AlignerSettings restart={restart} />

          <AdvancedFields>
            {showTranscription && (aligner ?? "whisper") === "ctc" && (
              <CtcAdvancedFields />
            )}

            <SettingsFormField
              name="alignmentAutoExclude"
              label={tt("autoExclude")}
              description={tt("autoExcludeDescription")}
              tip={tt("autoExcludeTip")}
              render={(field, _fieldState, isLocked) => (
                <Switch
                  checked={field.value ?? true}
                  onCheckedChange={(checked) => {
                    field.onChange(checked)
                  }}
                  disabled={isLocked}
                />
              )}
            />
          </AdvancedFields>
        </SettingsCard>
      </SettingsSection>

      {showAudio && (
        <SettingsSection id="audio">
          <SettingsCard
            collapsible={collapsible}
            defaultOpen={!collapsible}
            title={ta("title")}
          >
            <SettingsFormField
              name="codec"
              label={ta("codec")}
              description={ta("codecDescription")}
              tip={ta("codecTip")}
              render={(field, fieldState, isLocked) => (
                <Select
                  disabled={isLocked}
                  aria-invalid={fieldState.invalid}
                  data-disabled={isLocked}
                  value={field.value ?? "default"}
                  items={codecOptions.map(({ value, label }) => ({
                    value,
                    label,
                  }))}
                  onValueChange={(value) => {
                    field.onChange(value === "default" ? null : value)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {codecOptions.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />

            {codec === "libopus" && (
              <SettingsFormField
                name="bitrate"
                label={ta("bitrate")}
                render={(field, fieldState, isLocked) => (
                  <Select
                    items={opusBitrateOptions}
                    disabled={isLocked}
                    aria-invalid={fieldState.invalid}
                    data-disabled={isLocked}
                    value={field.value ?? ""}
                    onValueChange={(value) => {
                      field.onChange(value || null)
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {opusBitrateOptions.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}

            {codec === "libmp3lame" && (
              <SettingsFormField
                name="bitrate"
                label={ta("bitrate")}
                render={(field, fieldState, isLocked) => (
                  <Select
                    disabled={isLocked}
                    aria-invalid={fieldState.invalid}
                    data-disabled={isLocked}
                    value={field.value ?? ""}
                    onValueChange={(value) => {
                      field.onChange(value || null)
                    }}
                    items={mp3BitrateOptions}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {mp3BitrateOptions.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            <AdvancedFields>
              <SettingsFormField
                name="parallelTranscodes"
                label={ta("parallelTranscodes")}
                tip={ta("parallelTranscodesTip")}
                render={(field, fieldState, isLocked) => (
                  <Input
                    id="parallelTranscodes"
                    type="number"
                    min={1}
                    disabled={isLocked}
                    {...field}
                    onChange={(e) => {
                      field.onChange(parseInt(e.target.value) || 1)
                    }}
                    aria-invalid={fieldState.invalid}
                  />
                )}
              />
              <SettingsFormField
                name="maxTrackLength"
                label={ta("maxTrackLength")}
                description={ta("maxTrackLengthDescription")}
                tip={ta("maxTrackLengthTip")}
                render={(field, fieldState, isLocked) => (
                  <Select
                    disabled={isLocked}
                    aria-invalid={fieldState.invalid}
                    data-disabled={isLocked}
                    items={trackLengths.map(({ value, label }) => ({
                      value: String(value),
                      label,
                    }))}
                    value={String(field.value)}
                    onValueChange={(value) => {
                      if (value) {
                        field.onChange(parseFloat(value))
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {trackLengths.find(({ value }) => value === field.value)
                          ?.label ?? ta("maxTrackLength2")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {trackLengths.map(({ value, label }) => (
                        <SelectItem key={value} value={String(value)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </AdvancedFields>
          </SettingsCard>
        </SettingsSection>
      )}
    </div>
  )
}

function WhisperAlignerSettings({ restart }: { restart?: ProcessRestart }) {
  const { form } = useSettingsForm()
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")

  const transcriptionEngine = useWatch({
    control: form.control,
    name: "transcriptionEngine",
  })

  const engineCategories = [
    {
      key: "local",
      label: t("tabLocal"),
      engines: [
        {
          value: "whisper.cpp" as const,
          label: t("whisperCpp"),
          description: t("whisperCppDescription"),
        },
      ],
    },
    {
      key: "remote",
      label: t("tabRemote"),
      engines: [
        {
          value: "whisper-server" as const,
          label: t("whisperServer"),
          description: t("whisperServerDescription"),
        },
      ],
    },
    {
      key: "thirdParty",
      label: t("tabThirdParty"),
      engines: [
        {
          value: "openai-cloud" as const,
          label: t("openaiCloud"),
          description: t("openaiCloudDescription"),
        },
        {
          value: "deepgram" as const,
          label: t("deepgram"),
          description: t("deepgramDescription"),
        },
        {
          value: "google-cloud" as const,
          label: t("googleCloud"),
          description: t("googleCloudDescription"),
        },
        {
          value: "microsoft-azure" as const,
          label: t("microsoftAzure"),
          description: t("microsoftAzureDescription"),
        },
        {
          value: "amazon-transcribe" as const,
          label: t("amazonTranscribe"),
          description: t("amazonTranscribeDescription"),
        },
      ],
    },
  ]

  const engineCategoryOf = (engine: string | null | undefined) =>
    engineCategories.find((category) =>
      category.engines.some((e) => e.value === engine),
    )?.key ?? "local"

  const [engineTab, setEngineTab] = useState(() =>
    engineCategoryOf(transcriptionEngine),
  )

  return (
    <>
      <SettingsFormField
        name="transcriptionEngine"
        label={t("engine")}
        render={(field, _fieldState, isLocked) => (
          <Tabs
            value={engineTab}
            onValueChange={(value) => {
              if (typeof value === "string") setEngineTab(value)
            }}
          >
            <TabsList className="w-full">
              {engineCategories.map((category) => (
                <TabsTrigger key={category.key} value={category.key}>
                  {category.label}
                  {engineCategoryOf(field.value) === category.key && (
                    <span className="bg-primary size-1.5 shrink-0 rounded-full" />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            {engineCategories.map((category) => (
              <TabsContent key={category.key} value={category.key}>
                <RadioGroup
                  value={field.value}
                  onValueChange={(value) => {
                    if (typeof value === "string") field.onChange(value)
                  }}
                  disabled={isLocked}
                >
                  {category.engines.map((engine) => {
                    const selected = field.value === engine.value
                    const EngineSettings =
                      engineSettingsComponents[engine.value]
                    return (
                      <div
                        key={engine.value}
                        className={cn(
                          "overflow-hidden rounded-md border",
                          selected && "border-primary",
                        )}
                      >
                        <FieldLabel
                          htmlFor={`engine-${engine.value}`}
                          className="has-[>[data-slot=field]]:rounded-none has-[>[data-slot=field]]:border-0"
                        >
                          <Field orientation="horizontal">
                            <FieldContent>
                              <FieldTitle>{engine.label}</FieldTitle>
                              <FieldDescription>
                                {engine.description}
                              </FieldDescription>
                            </FieldContent>
                            <RadioGroupItem
                              value={engine.value}
                              id={`engine-${engine.value}`}
                            />
                          </Field>
                        </FieldLabel>
                        {selected && (
                          <div className="space-y-4 border-t p-3">
                            <EngineSettings />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </RadioGroup>
              </TabsContent>
            ))}
          </Tabs>
        )}
      />
      {restart !== "sync" && restart !== "transcode" && (
        <SettingsFormField
          name="parallelTranscribes"
          label={t("parallelTranscribes")}
          description={t("parallelTranscribesDescription")}
          tip={t("parallelTranscribesTip")}
          render={(field, fieldState, isLocked) => (
            <Input
              id="parallelTranscribes"
              type="number"
              min={1}
              disabled={isLocked}
              {...field}
              onChange={(e) => {
                field.onChange(parseInt(e.target.value) || 1)
              }}
              aria-invalid={fieldState.invalid}
            />
          )}
        />
      )}
    </>
  )
}

function CtcAlignerSettings({ restart }: { restart?: ProcessRestart }) {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")

  if (restart === "sync" || restart === "transcode") return null

  return (
    <SettingsFormField
      name="ctcEngine"
      label={t("ctcEngine")}
      render={(field, _fieldState, isLocked) => (
        <Tabs
          value={field.value ?? "ctc-local"}
          onValueChange={(value) => {
            if (typeof value === "string" && !isLocked) field.onChange(value)
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="ctc-local">{t("tabLocal")}</TabsTrigger>
            <TabsTrigger value="ctc-server">{t("tabRemote")}</TabsTrigger>
          </TabsList>
          <TabsContent value="ctc-local" className="space-y-4 pt-2">
            <FieldDescription>
              {t("ctcEngines.ctc-local.description")}
            </FieldDescription>
            <CtcDeviceField />
          </TabsContent>
          <TabsContent value="ctc-server" className="space-y-4 pt-2">
            <FieldDescription>
              {t("ctcEngines.ctc-server.description")}
            </FieldDescription>
            <CtcServerSettings />
          </TabsContent>
        </Tabs>
      )}
    />
  )
}

function CtcDeviceField() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
  const { capabilities: initialCapabilities } = useSettingsForm()
  const { data: fetchedCapabilities } = useGetServerCapabilitiesQuery(
    undefined,
    { skip: initialCapabilities !== undefined },
  )
  const capabilities = initialCapabilities ?? fetchedCapabilities

  const available = capabilities?.ctcDevices.available ?? []
  const deviceOptions = available.map((value) => ({
    value,
    label: t(`ctcDevices.${value}`),
  }))

  return (
    <SettingsFormField
      name="ctcDevice"
      label={t("ctcDevice")}
      description={t("ctcDeviceDescription")}
      render={(field, fieldState, isLocked) => (
        <Select
          items={deviceOptions}
          value={
            available.some((device) => device === field.value)
              ? (field.value ?? "")
              : (capabilities?.ctcDevices.default ?? "")
          }
          onValueChange={(value) => {
            field.onChange(value)
          }}
          disabled={isLocked}
          aria-invalid={fieldState.invalid}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {deviceOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  )
}

function CtcServerSettings() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
  const { form } = useSettingsForm()
  const url = useWatch({ control: form.control, name: "ctcServerUrl" })
  const apiKey = useWatch({ control: form.control, name: "ctcServerApiKey" })
  const [testServer, { data, error, isLoading }] = useTestCtcServerMutation()

  const errorMessage =
    error && "data" in error
      ? ((error.data as { error?: string } | undefined)?.error ??
        t("ctcServerUnreachable"))
      : error
        ? t("ctcServerUnreachable")
        : null

  return (
    <>
      <SettingsFormField
        name="ctcServerUrl"
        label={t("ctcServerUrl")}
        description={t("ctcServerUrlDescription")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="ctcServerUrl"
            disabled={isLocked}
            {...field}
            value={field.value || ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <SettingsFormField
        name="ctcServerApiKey"
        label={t("ctcServerApiKey")}
        description={t("ctcServerApiKeyDescription")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="ctcServerApiKey"
            type="password"
            disabled={isLocked}
            {...field}
            value={field.value || ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!url || !apiKey || isLoading}
          onClick={() => {
            void testServer({ url: url ?? "", apiKey: apiKey ?? "" })
          }}
        >
          {t("ctcServerTest")}
        </Button>
        {!isLoading && data && !error && (
          <span className="text-muted-foreground text-xs">
            {t("ctcServerConnected", {
              device: t(`ctcDevices.${data.device}`),
            })}
          </span>
        )}
        {!isLoading && errorMessage && (
          <span className="text-destructive text-xs">{errorMessage}</span>
        )}
      </div>
    </>
  )
}

function CtcAdvancedFields() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
  const locale = useLocale()

  const modelOptions = [
    { value: "quartznet15x5" as const, label: t("ctcModels.quartznet15x5") },
    { value: "mms" as const, label: t("ctcModels.mms") },
  ]

  const dtypeOptions = ["auto", ...CTC_DTYPES].map((value) => ({
    value,
    label: t(`ctcDtypes.${value as "auto" | (typeof CTC_DTYPES)[number]}`),
  }))

  const languageNames = new Intl.DisplayNames([locale], { type: "language" })

  return (
    <>
      <SettingsFormField
        name="ctcModel"
        label={t("ctcModel")}
        tip={t("ctcModelTip")}
        render={(field, fieldState, isLocked) => {
          const family = field.value ?? "quartznet15x5"
          return (
            <>
              <Select
                items={modelOptions}
                value={family}
                onValueChange={(value) => {
                  field.onChange(value)
                }}
                disabled={isLocked}
                aria-invalid={fieldState.invalid}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {family !== "mms" && (
                <FieldDescription>
                  {t("ctcModelLanguages", {
                    languages: ctcModelLanguages(family)
                      .map((language) => languageNames.of(language) ?? language)
                      .join(", "),
                  })}
                </FieldDescription>
              )}
            </>
          )
        }}
      />
      <SettingsFormField
        name="ctcDtype"
        label={t("ctcDtype")}
        description={t("ctcDtypeDescription")}
        tip={t("ctcDtypeTip")}
        render={(field, fieldState, isLocked) => (
          <Select
            items={dtypeOptions}
            value={field.value ?? "auto"}
            onValueChange={(value) => {
              field.onChange(value === "auto" ? null : value)
            }}
            disabled={isLocked}
            aria-invalid={fieldState.invalid}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dtypeOptions.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <SettingsFormField
        name="ctcBatchSize"
        label={t("ctcBatchSize")}
        description={t("ctcBatchSizeDescription")}
        tip={t("ctcBatchSizeTip")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="ctcBatchSize"
            type="number"
            min={1}
            max={16}
            placeholder={t("ctcBatchSizePlaceholder")}
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            onChange={(e) => {
              field.onChange(
                e.target.value === ""
                  ? null
                  : Math.max(1, parseInt(e.target.value) || 1),
              )
            }}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
    </>
  )
}

function WhisperSettings() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")

  const whisperModelOptions = [
    {
      group: t("modelGroupMultilingual"),
      options: [
        {
          value: "large-v3-turbo",
          label: "large-v3-turbo",
          hint: t("modelTurboHint"),
        },
      ],
    },
    {
      group: t("modelGroupEnglish"),
      options: [
        { value: "tiny.en", label: "tiny.en", hint: t("modelTinyEnHint") },
      ],
    },
    {
      group: t("modelGroupOther"),
      options: [
        { value: "tiny", label: "tiny" },
        { value: "tiny-q5_1", label: "tiny-q5_1" },
        { value: "base", label: "base" },
        { value: "base.en", label: "base.en" },
        { value: "base-q5_1", label: "base-q5_1" },
        { value: "small", label: "small" },
        { value: "small.en", label: "small.en" },
        { value: "small-q5_1", label: "small-q5_1" },
        { value: "medium", label: "medium" },
        { value: "medium.en", label: "medium.en" },
        { value: "medium-q5_0", label: "medium-q5_0" },
        { value: "large-v1", label: "large-v1" },
        { value: "large-v2", label: "large-v2" },
        { value: "large-v2-q5_0", label: "large-v2-q5_0" },
        { value: "large-v3", label: "large-v3" },
        { value: "large-v3-q5_0", label: "large-v3-q5_0" },
        { value: "large-v3-turbo-q5_0", label: "large-v3-turbo-q5_0" },
      ],
    },
  ]

  const whisperCpuFallbackOptions = [
    { value: "", label: t("whisperCpuFallbackDefault") },
    { value: "blas", label: t("whisperCpuFallbackBlas") },
    { value: "cpu", label: t("whisperCpuFallbackCpu") },
  ]

  return (
    <>
      <SettingsFormField
        name="whisperModel"
        label={t("whisperModel")}
        render={(field, fieldState, isLocked) => (
          <Select
            items={whisperModelOptions.flatMap((option) =>
              option.options.map(({ value, label }) => ({ value, label })),
            )}
            value={field.value}
            onValueChange={field.onChange}
            disabled={isLocked}
            aria-invalid={fieldState.invalid}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {whisperModelOptions.map(({ group, options }) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {options.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="[&>div]:whitespace-normal"
                    >
                      <OptionWithHint
                        label={option.label}
                        hint={"hint" in option ? option.hint : null}
                      />
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      />

      <AdvancedFields>
        <SettingsFormField
          name="whisperCpuFallback"
          label={t("whisperCpuFallback")}
          tip={t("whisperCpuFallbackTip")}
          render={(field, fieldState, isLocked) => (
            <Select
              items={whisperCpuFallbackOptions}
              value={field.value || ""}
              onValueChange={(val) => {
                field.onChange(val || null)
              }}
              disabled={isLocked}
              aria-invalid={fieldState.invalid}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {whisperCpuFallbackOptions.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <SettingsFormField
          name="whisperThreads"
          label={t("whisperThreads")}
          description={t("whisperThreadsWarning")}
          tip={t("whisperThreadsTip")}
          render={(field, fieldState, isLocked) => (
            <Input
              id="whisperThreads"
              type="number"
              min={1}
              max={16}
              disabled={isLocked}
              {...field}
              onChange={(e) => {
                field.onChange(parseInt(e.target.value) || 1)
              }}
              aria-invalid={fieldState.invalid}
            />
          )}
        />
      </AdvancedFields>
    </>
  )
}

function WhisperServerSettings() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")

  return (
    <>
      <SettingsFormField
        name="whisperServerUrl"
        label={t("whisperServerUrl")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="whisperServerUrl"
            placeholder="http://192.168.1.19:8080"
            disabled={isLocked}
            {...field}
            value={field.value || ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <SettingsFormField
        name="whisperServerApiKey"
        label={t("whisperServerApiKey")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="whisperServerApiKey"
            type="password"
            disabled={isLocked}
            {...field}
            value={field.value || ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
    </>
  )
}

function GoogleCloudSettings() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
  return (
    <SettingsFormField
      name="googleCloudApiKey"
      label={t("apiKey")}
      render={(field, fieldState, isLocked) => (
        <Input
          id="googleCloudApiKey"
          type="password"
          disabled={isLocked}
          {...field}
          value={field.value ?? ""}
          aria-invalid={fieldState.invalid}
        />
      )}
    />
  )
}

function AzureSettings() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
  return (
    <>
      <SettingsFormField
        name="azureSubscriptionKey"
        label={t("subscriptionKey")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="azureSubscriptionKey"
            type="password"
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <SettingsFormField
        name="azureServiceRegion"
        label={t("serviceRegion")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="azureServiceRegion"
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
    </>
  )
}

function AmazonSettings() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
  return (
    <>
      <SettingsFormField
        name="amazonTranscribeRegion"
        label={t("region")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="amazonTranscribeRegion"
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <SettingsFormField
        name="amazonTranscribeBucketName"
        label={t("bucketName")}
        tip={t("bucketNameTip")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="amazonTranscribeBucketName"
            disabled={isLocked}
            {...field}
            value={field.value || ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <SettingsFormField
        name="amazonTranscribeAccessKeyId"
        label={t("accessKeyId")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="amazonTranscribeAccessKeyId"
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <SettingsFormField
        name="amazonTranscribeSecretAccessKey"
        label={t("secretAccessKey")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="amazonTranscribeSecretAccessKey"
            type="password"
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
    </>
  )
}

function OpenAiSettings() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
  return (
    <>
      <SettingsFormField
        name="openAiApiKey"
        label={t("apiKey")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="openAiApiKey"
            type="password"
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <SettingsFormField
        name="openAiOrganization"
        label={t("organization")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="openAiOrganization"
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <SettingsFormField
        name="openAiBaseUrl"
        label={t("baseUrl")}
        tip={t("baseUrlTip")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="openAiBaseUrl"
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <SettingsFormField
        name="openAiModelName"
        label={t("modelName")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="openAiModelName"
            placeholder="whisper-1"
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
    </>
  )
}

function DeepgramSettings() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
  return (
    <>
      <SettingsFormField
        name="deepgramApiKey"
        label={t("apiKey")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="deepgramApiKey"
            type="password"
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <SettingsFormField
        name="deepgramModel"
        label={t("deepgramModel")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="deepgramModel"
            placeholder="nova-3"
            disabled={isLocked}
            {...field}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
    </>
  )
}

export function ReadaloudSection() {
  const tr = useTranslation("SettingsPage.tabs.processing.sections.readaloud")
  const { form, lockedSettings } = useSettingsForm()

  const permissions = usePermissions()

  const locationType = useWatch({
    control: form.control,
    name: "readaloudLocationType",
  })
  const location = useWatch({
    control: form.control,
    name: "readaloudLocation",
  })
  const locationPreview =
    locationType === "SUFFIX"
      ? `book${location}.epub`
      : `${location.replace(/\/+$/, "")}/book.epub`

  const readaloudLocationOptions = [
    { value: "SUFFIX", label: tr("locationTypeSuffix") },
    { value: "SIBLING_FOLDER", label: tr("locationTypeSiblingFolder") },
    { value: "CUSTOM_FOLDER", label: tr("locationTypeCustomFolder") },
    { value: "INTERNAL", label: tr("locationTypeInternal") },
  ] as const satisfies { value: ReadaloudLocationType; label: string }[]

  return (
    <SettingsSection id="readaloud">
      <SettingsCard title={tr("title")} description={tr("description")}>
        <SettingsFormField
          name="readaloudLocationType"
          label={tr("locationType")}
          render={(field, _, isLocked) => (
            <Select
              items={readaloudLocationOptions}
              disabled={isLocked}
              value={field.value}
              onValueChange={(value) => {
                if (!value) return

                field.onChange(value)
                switch (value) {
                  case "SUFFIX":
                    form.setValue("readaloudLocation", " (readaloud)", {
                      shouldDirty: true,
                    })
                    break
                  case "SIBLING_FOLDER":
                    form.setValue("readaloudLocation", "readaloud", {
                      shouldDirty: true,
                    })
                    break
                  case "CUSTOM_FOLDER":
                    form.setValue("readaloudLocation", "/readalouds", {
                      shouldDirty: true,
                    })
                    break
                  case "INTERNAL":
                    form.setValue("readaloudLocation", "", {
                      shouldDirty: true,
                    })
                    break
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {readaloudLocationOptions.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />

        {locationType !== "INTERNAL" && (
          <SettingsFormField
            name="readaloudLocation"
            label={
              locationType === "SUFFIX"
                ? tr("locationTypeSuffix")
                : locationType === "SIBLING_FOLDER"
                  ? tr("locationTypeSiblingFolder")
                  : tr("locationTypeCustomFolder")
            }
            render={(field, fieldState, isLocked) => (
              <>
                <Input
                  id="readaloudLocation"
                  disabled={isLocked}
                  {...field}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  {tr("previewLabel")}{" "}
                  <code className="font-mono">{locationPreview}</code>
                </FieldDescription>
              </>
            )}
          />
        )}

        <Controller
          name="cleanCacheAfterReadaloud"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field
              orientation="horizontal"
              data-invalid={fieldState.invalid}
              data-disabled={lockedSettings.has("cleanCacheAfterReadaloud")}
            >
              <Switch
                id="cleanCacheAfterReadaloud"
                disabled={lockedSettings.has("cleanCacheAfterReadaloud")}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <div className="space-y-1">
                <FieldLabel htmlFor="cleanCacheAfterReadaloud">
                  {tr("cleanCacheAfterReadaloud")}
                  <InfoTip>{tr("cleanCacheAfterReadaloudTip")}</InfoTip>
                  {lockedSettings.has("cleanCacheAfterReadaloud") && (
                    <LockTooltip />
                  )}
                </FieldLabel>
                <FieldDescription>
                  {tr("cleanCacheAfterReadaloudDescription")}
                </FieldDescription>
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {permissions?.bookProcess && (
          <SettingsLink section="caches">{tr("clearCacheLink")}</SettingsLink>
        )}
      </SettingsCard>
    </SettingsSection>
  )
}
