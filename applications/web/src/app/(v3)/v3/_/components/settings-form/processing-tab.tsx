"use client"

import { useLocale } from "next-intl"
import { type ReactNode, useState } from "react"
import { Controller, useWatch } from "react-hook-form"
import { toast } from "sonner"

import {
  ALIGNERS,
  CTC_MODEL_FAMILIES,
  WAV2VEC2_DEVICES,
  WAV2VEC2_DTYPES,
  ctcModelLanguages,
} from "@storyteller-platform/ghost-story/constants"

import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@v3/_/components/ui/collapsible"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@v3/_/components/ui/field"
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
import {
  ConfirmDialog,
  useConfirmAction,
} from "@/app/(v3)/v3/_/components/ui/confirm-dialog"
import { MP3_CBR_BITRATE_OPTIONS } from "@/assets/audio/mp3Bitrates"
import { cn } from "@/cn"
import {
  // type AlignmentGranularity,
  type ReadaloudLocationType,
} from "@/database/settingsTypes"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"
import { useClearBooksCacheMutation } from "@/store/api"

import {
  LockTooltip,
  SettingsFormField,
  useSettingsForm,
} from "./SettingsFormProvider"
import { SettingsSection } from "./shared"

export function ProcessingTab() {
  return (
    <div className="space-y-6">
      <ReadaloudSection />
      <ProcessingSettingsFields />
    </div>
  )
}

function SettingsCard({
  collapsible = false,
  defaultOpen = true,
  title,
  description,
  children,
}: {
  collapsible?: boolean
  defaultOpen?: boolean
  title: string
  description: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (!collapsible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full cursor-pointer text-left">
          <CardHeader className="w-full">
            <CardTitle className="flex w-full items-start justify-between">
              {title}
              <icon.ChevronDown
                className={cn(
                  "text-muted-foreground mt-0.5 size-4 shrink-0 stroke-[1.5] transition-transform",
                  open && "rotate-180",
                )}
              />
            </CardTitle>

            <CardDescription>{description}</CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-4">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

const alignerSettingsComponents = {
  whisper: WhisperAlignerSettings,
  ctc: CtcAlignerSettings,
}

// const wav2vecEngineSettingsComponents = {
//   "wav2vec-local": Wav2VecLocalSettings,
//   "wav2vec-server": Wav2VecServerSettings,
// }

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
  const tp = useTranslation(
    "SettingsPage.tabs.processing.sections.parallelization",
  )
  const ta = useTranslation("SettingsPage.tabs.processing.sections.audio")

  const aligner = useWatch({ control: form.control, name: "aligner" })
  const codec = useWatch({ control: form.control, name: "codec" })

  const AlignerSettings = alignerSettingsComponents[aligner ?? "whisper"]

  const alignerOptions = ALIGNERS.map((value) => ({
    value,
    label: tt(`aligners.${value}.label`),
    description: tt(`aligners.${value}.description`),
  }))

  const trackLengths = [
    { value: 0.75, label: ta("maxTrackLength45") },
    { value: 1, label: ta("maxTrackLength1") },
    { value: 2, label: ta("maxTrackLength2") },
    { value: 3, label: ta("maxTrackLength3") },
    { value: 4, label: ta("maxTrackLength4") },
  ]

  const gapOptions = [
    { value: "0", label: tt("gapSecondsOff") },
    ...[2, 5, 10, 30].map((seconds) => ({
      value: String(seconds),
      label: tt("gapSecondsValue", { count: seconds }),
    })),
  ]

  const audioChapterOptions = [
    { value: "0", label: tt("audioChapterSecondsOff") },
    ...[1, 2, 5, 10].map((minutes) => ({
      value: String(minutes * 60),
      label: tt("audioChapterSecondsValue", { count: minutes }),
    })),
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
      <SettingsSection tab="processing" section="alignment">
        <SettingsCard
          collapsible={collapsible}
          defaultOpen
          title={tt("title")}
          description={tt("description")}
        >
          {showTranscription && (
            <SettingsFormField
              name="aligner"
              label={tt("aligner")}
              render={(field, _fieldState, isLocked) => (
                <RadioGroup
                  value={field.value ?? "whisper"}
                  onValueChange={(value) => {
                    if (typeof value === "string") field.onChange(value)
                  }}
                  disabled={isLocked}
                >
                  {alignerOptions.map((option) => {
                    const selected = (field.value ?? "whisper") === option.value
                    return (
                      <div
                        key={option.value}
                        className={cn(
                          "overflow-hidden rounded-md border",
                          selected && "border-primary",
                        )}
                      >
                        <FieldLabel
                          htmlFor={`aligner-${option.value}`}
                          className="has-[>[data-slot=field]]:rounded-none has-[>[data-slot=field]]:border-0"
                        >
                          <Field orientation="horizontal">
                            <FieldContent>
                              <FieldTitle>{option.label}</FieldTitle>
                              <FieldDescription>
                                {option.description}
                              </FieldDescription>
                            </FieldContent>
                            <RadioGroupItem
                              value={option.value}
                              id={`aligner-${option.value}`}
                            />
                          </Field>
                        </FieldLabel>
                      </div>
                    )
                  })}
                </RadioGroup>
              )}
            />
          )}

          <AlignerSettings restart={restart} />

          <SettingsFormField
            name="alignmentGapSeconds"
            label={tt("gapSeconds")}
            description={tt("gapsDescription")}
            render={(field, fieldState, isLocked) => (
              <Select
                disabled={isLocked}
                aria-invalid={fieldState.invalid}
                data-disabled={isLocked}
                items={gapOptions}
                value={String(field.value ?? 0)}
                onValueChange={(value) => {
                  if (value !== null) field.onChange(parseFloat(value))
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {gapOptions.find(
                      ({ value }) => value === String(field.value ?? 0),
                    )?.label ?? tt("gapSecondsOff")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {gapOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />

          <SettingsFormField
            name="alignmentAudioChapterSeconds"
            label={tt("audioChapterSeconds")}
            render={(field, fieldState, isLocked) => (
              <Select
                disabled={isLocked}
                aria-invalid={fieldState.invalid}
                data-disabled={isLocked}
                items={audioChapterOptions}
                value={String(field.value ?? 0)}
                onValueChange={(value) => {
                  if (value !== null) field.onChange(parseFloat(value))
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {audioChapterOptions.find(
                      ({ value }) => value === String(field.value ?? 0),
                    )?.label ?? tt("audioChapterSecondsOff")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {audioChapterOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />

          <SettingsFormField
            name="alignmentDropUnread"
            label={tt("dropUnread")}
            description={tt("dropUnreadDescription")}
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
        </SettingsCard>
      </SettingsSection>

      {showAudio && (
        <SettingsSection tab="processing" section="audio">
          <SettingsCard
            collapsible={collapsible}
            defaultOpen={!collapsible}
            title={ta("title")}
            description={ta("description")}
          >
            <SettingsFormField
              name="maxTrackLength"
              label={ta("maxTrackLength")}
              description={ta("maxTrackLengthDescription")}
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

            <SettingsFormField
              name="codec"
              label={ta("codec")}
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
          </SettingsCard>
        </SettingsSection>
      )}

      {(showAudio || showTranscription) && (
        <SettingsSection tab="processing" section="parallelization">
          <SettingsCard
            collapsible={collapsible}
            defaultOpen={!collapsible}
            title={tp("title")}
            description={tp("description")}
          >
            {showAudio && (
              <SettingsFormField
                name="parallelTranscodes"
                label={tp("parallelTranscodes")}
                description={tp("parallelTranscodesDescription")}
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
            )}
            {showTranscription && (
              <SettingsFormField
                name="parallelTranscribes"
                label={tp("parallelTranscribes")}
                description={tp("parallelTranscribesDescription")}
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
          </SettingsCard>
        </SettingsSection>
      )}
    </div>
  )
}

// function AlignmentGranularitySettings({ disabled }: { disabled?: boolean }) {
//   const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")

//   const alignmentGranularityOptions = [
//     { value: "sentence", label: t("alignmentGranularitySentence") },
//     { value: "word", label: t("alignmentGranularityWord") },
//   ] satisfies { value: AlignmentGranularity; label: string }[]

//   return (
//     <>
//       <SettingsFormField
//         name="alignmentGranularity"
//         label={t("alignmentGranularity")}
//         description={t("alignmentGranularityDescription")}
//         render={(field, fieldState) => (
//           <Select
//             items={alignmentGranularityOptions}
//             value={field.value ?? "sentence"}
//             onValueChange={(value) => {
//               field.onChange(value)
//             }}
//             disabled={disabled}
//             aria-invalid={fieldState.invalid}
//             data-disabled={disabled}
//           >
//             <SelectTrigger className="w-full">
//               <SelectValue />
//             </SelectTrigger>
//             <SelectContent>
//               {alignmentGranularityOptions.map(({ value, label }) => (
//                 <SelectItem key={value} value={value}>
//                   {label}
//                 </SelectItem>
//               ))}
//             </SelectContent>
//           </Select>
//         )}
//       />
//     </>
//   )
// }

function WhisperAlignerSettings({ restart: _ }: { restart?: ProcessRestart }) {
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
                  const EngineSettings = engineSettingsComponents[engine.value]
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
  )
}

function CtcAlignerSettings({ restart }: { restart?: ProcessRestart }) {
  return (
    <>
      {/* <AlignmentGranularitySettings /> */}
      {restart !== "sync" && restart !== "transcode" && (
        <Wav2VecLocalSettings />
      )}
    </>
  )
}

// function Wav2VecEnginePicker() {
//   const { form } = useSettingsForm()
//   const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
//
//   const ctcEngine = useWatch({ control: form.control, name: "ctcEngine" })
//
//   const ctcEngines = WAV2VEC_ENGINES.map((value) => ({
//     value,
//     label: t(`ctcEngines.${value}.label`),
//     description: t(`ctcEngines.${value}.description`),
//   }))
//
//   const [engineTab, setEngineTab] = useState<string>(ctcEngine ?? "wav2vec-local")
//
//   return (
//     <SettingsFormField
//       name="ctcEngine"
//       label={t("ctcEngine")}
//       render={(field, _fieldState, isLocked) => {
//         const selectedEngine = field.value ?? "wav2vec-local"
//         return (
//           <Tabs
//             value={engineTab}
//             onValueChange={(value) => {
//               if (typeof value === "string") setEngineTab(value)
//             }}
//           >
//             <TabsList className="w-full">
//               {ctcEngines.map((engine) => (
//                 <TabsTrigger key={engine.value} value={engine.value}>
//                   {engine.label}
//                   {selectedEngine === engine.value && (
//                     <span className="bg-primary size-1.5 shrink-0 rounded-full" />
//                   )}
//                 </TabsTrigger>
//               ))}
//             </TabsList>
//             {ctcEngines.map((engine) => {
//               const selected = selectedEngine === engine.value
//               const EngineSettings = wav2vecEngineSettingsComponents[engine.value]
//               return (
//                 <TabsContent key={engine.value} value={engine.value}>
//                   <RadioGroup
//                     value={selectedEngine}
//                     onValueChange={(value) => {
//                       if (typeof value === "string") field.onChange(value)
//                     }}
//                     disabled={isLocked}
//                   >
//                     <div
//                       className={cn(
//                         "overflow-hidden rounded-md border",
//                         selected && "border-primary",
//                       )}
//                     >
//                       <FieldLabel
//                         htmlFor={`ctc-engine-${engine.value}`}
//                         className="has-[>[data-slot=field]]:rounded-none has-[>[data-slot=field]]:border-0"
//                       >
//                         <Field orientation="horizontal">
//                           <FieldContent>
//                             <FieldTitle>{engine.label}</FieldTitle>
//                             <FieldDescription>
//                               {engine.description}
//                             </FieldDescription>
//                           </FieldContent>
//                           <RadioGroupItem
//                             value={engine.value}
//                             id={`ctc-engine-${engine.value}`}
//                           />
//                         </Field>
//                       </FieldLabel>
//                       {selected && (
//                         <div className="space-y-4 border-t p-3">
//                           <EngineSettings />
//                         </div>
//                       )}
//                     </div>
//                   </RadioGroup>
//                 </TabsContent>
//               )
//             })}
//           </Tabs>
//         )
//       }}
//     />
//   )
// }

function Wav2VecLocalSettings() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
  const locale = useLocale()

  const deviceOptions = WAV2VEC2_DEVICES.map((value) => ({
    value,
    label: t(`ctcDevices.${value}`),
  }))

  const modelOptions = CTC_MODEL_FAMILIES.map((value) => ({
    value,
    label: t(`ctcModels.${value}`),
  }))

  const dtypeOptions = ["auto", ...WAV2VEC2_DTYPES].map((value) => ({
    value,
    label: t(`ctcDtypes.${value as "auto" | (typeof WAV2VEC2_DTYPES)[number]}`),
  }))

  const languageNames = new Intl.DisplayNames([locale], { type: "language" })

  return (
    <>
      <SettingsFormField
        name="ctcDevice"
        label={t("ctcDevice")}
        description={t("ctcDeviceDescription")}
        render={(field, fieldState, isLocked) => (
          <Select
            items={deviceOptions}
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
              {deviceOptions.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <SettingsFormField
        name="ctcModel"
        label={t("ctcModel")}
        description={t("ctcModelDescription")}
        render={(field, fieldState, isLocked) => {
          const family = field.value ?? "mms"
          return (
            <>
              <Select
                items={modelOptions}
                value={family}
                onValueChange={(value) => {
                  field.onChange(value === "mms" ? null : value)
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

// function Wav2VecServerSettings() {
//   const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")
//
//   return (
//     <>
//       <SettingsFormField
//         name="ctcServerUrl"
//         label={t("ctcServerUrl")}
//         description={t("ctcServerUrlDescription")}
//         render={(field, fieldState, isLocked) => (
//           <Input
//             id="ctcServerUrl"
//             disabled={isLocked}
//             {...field}
//             value={field.value || ""}
//             aria-invalid={fieldState.invalid}
//           />
//         )}
//       />
//       <SettingsFormField
//         name="ctcServerApiKey"
//         label={t("ctcServerApiKey")}
//         description={t("ctcServerApiKeyDescription")}
//         render={(field, fieldState, isLocked) => (
//           <Input
//             id="ctcServerApiKey"
//             type="password"
//             disabled={isLocked}
//             {...field}
//             value={field.value || ""}
//             aria-invalid={fieldState.invalid}
//           />
//         )}
//       />
//     </>
//   )
// }

function WhisperSettings() {
  const t = useTranslation("SettingsPage.tabs.processing.sections.alignment")

  const whisperModelOptions = [
    {
      group: "Recommended for non-English",
      options: [{ value: "large-v3-turbo", label: "large-v3-turbo" }],
    },
    {
      group: "Recommended for English",
      options: [{ value: "tiny.en", label: "tiny.en" }],
    },

    {
      group: "Others",
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
      {/* <AlignmentGranularitySettings disabled={true} /> */}
      <SettingsFormField
        name="whisperModel"
        label={t("whisperModel")}
        description={t("whisperModelDescription")}
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
                  {options.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      />

      <SettingsFormField
        name="whisperThreads"
        label={t("whisperThreads")}
        description={t("whisperThreadsDescription")}
        render={(field, fieldState, isLocked) => (
          <>
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
            <p className="text-xs opacity-70">
              <span className="font-bold text-orange-600">
                {t("whisperThreadsWarningPrefix")}
              </span>{" "}
              {t("whisperThreadsWarning")}
            </p>
          </>
        )}
      />

      <SettingsFormField
        name="whisperCpuFallback"
        label={t("whisperCpuFallback")}
        description={t("whisperCpuFallbackDescription")}
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
        description={t("whisperServerUrlDescription")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="whisperServerUrl"
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
        description={t("whisperServerApiKeyDescription")}
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
        description={t("bucketNameDescription")}
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
        description={t("baseUrlDescription")}
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
        description={t("modelNameDescription")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="openAiModelName"
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
        description={t("deepgramModelDescription")}
        render={(field, fieldState, isLocked) => (
          <Input
            id="deepgramModel"
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

function ReadaloudSection() {
  const tr = useTranslation("SettingsPage.tabs.processing.sections.readaloud")
  const { form, lockedSettings } = useSettingsForm()

  const permissions = usePermissions()
  const [clearBooksCache] = useClearBooksCacheMutation()
  const {
    isLoading,
    confirm: clearCacheConfirm,
    dialogProps: clearCacheDialogProps,
  } = useConfirmAction({
    title: tr("clearCacheConfirmTitle"),
    description: tr("clearCacheConfirmDescription"),
    confirmLabel: tr("clearCacheConfirm"),
    variant: "destructive",
    onConfirm: () => {
      void clearBooksCache({})
        .unwrap()
        .then(() => {
          toast.success(tr("clearCacheSuccess"))
        })
        .catch(() => {
          toast.error(tr("clearCacheError"))
        })
    },
  })

  const locationType = useWatch({
    control: form.control,
    name: "readaloudLocationType",
  })

  const readaloudLocationOptions = [
    { value: "SUFFIX", label: tr("locationTypeSuffix") },
    { value: "SIBLING_FOLDER", label: tr("locationTypeSiblingFolder") },
    { value: "CUSTOM_FOLDER", label: tr("locationTypeCustomFolder") },
    { value: "INTERNAL", label: tr("locationTypeInternal") },
  ] as const satisfies { value: ReadaloudLocationType; label: string }[]

  return (
    <SettingsSection tab="processing" section="readaloud">
      <Card>
        <CardHeader>
          <CardTitle>{tr("title")}</CardTitle>
          <CardDescription>{tr("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <Input
                  id="readaloudLocation"
                  disabled={isLocked}
                  {...field}
                  aria-invalid={fieldState.invalid}
                />
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
                    {lockedSettings.has("cleanCacheAfterReadaloud") && (
                      <LockTooltip />
                    )}
                  </FieldLabel>
                  <FieldDescription>
                    {tr("cleanCacheAfterReadaloudDescription")}
                  </FieldDescription>
                </div>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          {permissions?.bookProcess && (
            <div className="space-y-1.5">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isLoading}
                onClick={clearCacheConfirm}
              >
                {isLoading ? "..." : tr("clearCacheNow")}
              </Button>
              <FieldDescription>
                {tr("clearCacheNowDescription")}
              </FieldDescription>
            </div>
          )}

          <ConfirmDialog {...clearCacheDialogProps} />
        </CardContent>
      </Card>
    </SettingsSection>
  )
}
