"use client"

import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Checkbox,
  Code,
  Fieldset,
  Group,
  List,
  MultiSelect,
  NativeSelect,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { IconFlame, IconPlus, IconTrash } from "@tabler/icons-react"
import { useRef, useState } from "react"

import type { Settings } from "@/apiModels"
import { ImportPathInput } from "@/components/ImportPathInput"
import {
  ADMIN_PERMISSIONS,
  BASIC_PERMISSIONS,
  PERMISSIONS_VALUES,
} from "@/components/users/CreateInviteForm"
import {
  useGetMaxUploadChunkSizeQuery,
  useUpdateSettingsMutation,
} from "@/store/api"

import { AuthProviderInput } from "./AuthProviderInput"

interface Props {
  settings: Settings
  authUrl?: string | undefined
  whisperVariant?: string | undefined
}

function safeUrl(base: string, path: string) {
  try {
    return new URL(path, base).toString()
  } catch {
    return `${base}/${path}`
  }
}

export function SettingsForm({ settings, authUrl, whisperVariant }: Props) {
  const [saved, setSaved] = useState(false)
  const clearSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { data: maxUploadChunkSize } = useGetMaxUploadChunkSizeQuery()

  const [updateSettings] = useUpdateSettingsMutation()

  const initialValues: Settings = {
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpUsername: settings.smtpUsername,
    smtpPassword: settings.smtpPassword,
    smtpFrom: settings.smtpFrom,
    smtpSsl: settings.smtpSsl,
    smtpRejectUnauthorized: settings.smtpRejectUnauthorized,
    libraryName: settings.libraryName,
    webUrl: settings.webUrl,
    maxTrackLength: settings.maxTrackLength ?? 2,
    codec: settings.codec ?? "",
    bitrate: settings.bitrate ?? "",
    transcriptionEngine: settings.transcriptionEngine ?? "whisper.cpp",
    whisperModel: settings.whisperModel ?? "tiny",
    whisperThreads: settings.whisperThreads,
    whisperModelOverrides: settings.whisperModelOverrides,
    autoDetectLanguage: settings.autoDetectLanguage,
    whisperCpuFallback: settings.whisperCpuFallback,
    whisperServerUrl: settings.whisperServerUrl ?? "",
    whisperServerApiKey: settings.whisperServerApiKey ?? "",
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
    parallelTranscribes: settings.parallelTranscribes,
    parallelTranscodes: settings.parallelTranscodes,
    authProviders: settings.authProviders,
    disablePasswordLogin: settings.disablePasswordLogin,
    importPath: settings.importPath,
    readaloudLocationType: settings.readaloudLocationType,
    readaloudLocation: settings.readaloudLocation,
    maxUploadChunkSize:
      maxUploadChunkSize?.maxUploadChunkSize ?? settings.maxUploadChunkSize,
    opdsEnabled: settings.opdsEnabled,
    opdsPageSize: settings.opdsPageSize,
  }

  const form = useForm({
    mode: "controlled",
    initialValues,
  })

  const state = form.values
  const canDisablePassword = state.authProviders.some(
    (p) =>
      p.kind === "custom" &&
      p.allowRegistration &&
      Object.values(p.groupPermissions ?? {}).some((perms) =>
        perms.includes("settingsUpdate"),
      ),
  )
  // sometimes the webUrl is not a valid URL, so we fallback to /opds
  const opdsUrl = safeUrl(state.webUrl, "/opds")
  const authUrlPath = authUrl ?? safeUrl(state.webUrl, "/api/v2/auth")

  return (
    <form
      onSubmit={form.onSubmit(async (updatedSettings) => {
        await updateSettings(updatedSettings)
        setSaved(true)

        if (clearSavedTimeoutRef.current) {
          clearTimeout(clearSavedTimeoutRef.current)
        }
        clearSavedTimeoutRef.current = setTimeout(() => {
          setSaved(false)
        }, 2000)
      })}
    >
      <Fieldset legend="Library settings">
        <TextInput
          label="Library name"
          {...form.getInputProps("libraryName")}
        />
        <TextInput
          label="Web URL"
          {...form.getInputProps("webUrl")}
          type="url"
        />
      </Fieldset>
      <ImportPathInput {...form.getInputProps("importPath")}>
        <Text className="text-sm text-black opacity-70 dark:text-white">
          Storyteller can be configured to automatically import book files from
          a specific directory.
        </Text>
        <Text className="text-sm text-black opacity-70 dark:text-white">
          When enabled, Storyteller will set up a filesystem watcher for the
          directory. When any files are added or modified within the directory,
          Storyteller will scan for new book files, and automatically import any
          that it finds.
        </Text>
        <Text className="text-sm text-black opacity-70 dark:text-white">
          Book files found in this directory will not be automatically added to
          a collection. You can also configure collection-specific automatic
          import in the settings for that collection.
        </Text>
      </ImportPathInput>
      <Fieldset legend="Readaloud location">
        <Box className="mb-3 text-sm opacity-70">
          <Text className="text-sm text-black dark:text-white">
            Storyteller can be configured to save new readaloud files in a
            number of places, when the input files were not uploaded through the
            web client:
          </Text>
          <List listStyleType="disc" className="text-sm">
            <List.Item>
              In the same folder as the input EPUB file, with a user-provided
              suffix (defaults to “ (readaloud)”).
            </List.Item>
            <List.Item>
              In a user-provided folder name next to the EPUB file (defaults to
              “readaloud/”).
            </List.Item>
            <List.Item>
              In a user-provided folder somewhere outside the auto-import
              folder.
            </List.Item>
            <List.Item>
              In the Storyteller internal folder, alongside the transcoded audio
              and transcription files.
            </List.Item>
          </List>
        </Box>
        <NativeSelect
          label="Readaloud location"
          {...form.getInputProps("readaloudLocationType")}
          onChange={(e) => {
            const value = e.currentTarget
              .value as Settings["readaloudLocationType"]
            form.setFieldValue("readaloudLocationType", value)
            switch (value) {
              case "SUFFIX": {
                form.setFieldValue("readaloudLocation", " (readaloud)")
                break
              }
              case "SIBLING_FOLDER": {
                form.setFieldValue("readaloudLocation", "readaloud")
                break
              }
              case "CUSTOM_FOLDER": {
                form.setFieldValue("readaloudLocation", "/readalouds")
                break
              }
              case "INTERNAL": {
                form.setFieldValue("readaloudLocation", "")
                break
              }
            }
          }}
        >
          <option value="SUFFIX">Alongside input with a suffix</option>
          <option value="SIBLING_FOLDER">Alongside input in a folder</option>
          <option value="CUSTOM_FOLDER">In a custom folder</option>
          <option value="INTERNAL">In the Storyteller internal folder</option>
        </NativeSelect>
        {form.values.readaloudLocationType !== "INTERNAL" && (
          <TextInput
            label={
              form.values.readaloudLocationType === "SUFFIX"
                ? "Suffix"
                : form.values.readaloudLocationType === "SIBLING_FOLDER"
                  ? "Sibling folder name"
                  : "Custom folder path"
            }
            {...form.getInputProps("readaloudLocation")}
          />
        )}
      </Fieldset>
      <Fieldset legend="Audio settings">
        <NativeSelect
          label="Maximum processed track length"
          description={
            <span className="text-black opacity-70 dark:text-white">
              Audio tracks longer than this will be split to be this length or
              shorter before transcribing.
              <br />
              This can help with reducing Storyteller&rsquo;s memory usage
              during transcription.
            </span>
          }
          {...form.getInputProps("maxTrackLength")}
        >
          <option value={0.75}>45 minutes</option>
          <option value={1}>1 hour</option>
          <option value={2}>2 hours (default)</option>
          <option value={3}>3 hours</option>
          <option value={4}>4 hours</option>
        </NativeSelect>
        <NativeSelect
          label="Preferred audio codec"
          {...form.getInputProps("codec")}
          onChange={(e) => {
            form.setFieldValue("codec", e.target.value)
            form.setFieldValue("bitrate", "")
          }}
        >
          <option value="">Default</option>
          <option value="libopus">OPUS</option>
          <option value="libmp3lame">MP3</option>
          <option value="aac">AAC</option>
        </NativeSelect>
        {state.codec === "libopus" && (
          <NativeSelect
            label="Preferred audio bitrate"
            {...form.getInputProps("bitrate")}
          >
            <option value="">Default (32 Kb/s)</option>
            <option value="16K">16 Kb/s</option>
            <option value="24K">24 Kb/s</option>
            <option value="32K">32 Kb/s</option>
            <option value="64K">64 Kb/s</option>
            <option value="96K">96 Kb/s</option>
          </NativeSelect>
        )}
        {state.codec === "libmp3lame" && (
          <NativeSelect
            label="Preferred audio bitrate"
            {...form.getInputProps("bitrate")}
          >
            <option value="">Default (constant 48 kb/s)</option>
            <option value="0">0 (high quality/low compression)</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">
              4 (perceptually transparent/moderate compression)
            </option>
            <option value="5">5</option>
            <option value="6">6 (acceptable quality/high compression)</option>
            <option value="7">7</option>
            <option value="8">8</option>
            <option value="9">9</option>
          </NativeSelect>
        )}
      </Fieldset>
      <Fieldset legend="Transcription settings">
        <Box className="mb-3 text-sm opacity-70">
          <p>
            As part of the synchronization process, Storyteller attempts to
            transcribe the audiobook narration to text.
          </p>
          <p>
            This is by far the most resource-intensive phase of the process. By
            default, Storyteller will attempt to run the transcription job
            locally, using your server&apos;s hardware.
          </p>
          <p>
            You can also run the transcription job via a remote `whisper.cpp`
            server. This most often used when you want to run the transcription
            job on a different machine than the one running Storyteller. See the
            documentation for more details.
          </p>
          <p>
            If you would prefer to run the task via a paid third-party service,
            you set that with the &quot;transcription engine&quot; setting
            below.
          </p>
          <p>The available paid transcription services are:</p>
          <List listStyleType="disc" className="text-sm">
            <List.Item>
              <a href="https://cloud.google.com/text-to-speech">Google Cloud</a>
            </List.Item>
            <List.Item>
              <a href="https://cloud.google.com/speech-to-text" rel="nofollow">
                Google Cloud
              </a>
            </List.Item>
            <List.Item>
              <a
                href="https://azure.microsoft.com/en-us/products/ai-services/speech-to-text/"
                rel="nofollow"
              >
                Azure Cognitive Services
              </a>
            </List.Item>
            <List.Item>
              <a href="https://aws.amazon.com/transcribe/" rel="nofollow">
                Amazon Transcribe
              </a>
            </List.Item>
            <List.Item>
              <a href="https://platform.openai.com/" rel="nofollow">
                OpenAI Cloud Platform
              </a>
            </List.Item>
            <List.Item>
              <a
                href="https://developers.deepgram.com/docs/pre-recorded-audio"
                rel="nofollow"
              >
                Deepgram Speech to Text
              </a>
            </List.Item>
          </List>
        </Box>
        <NativeSelect
          label="Transcription engine"
          {...form.getInputProps("transcriptionEngine")}
        >
          <option value="whisper.cpp">whisper.cpp (local)</option>
          <option value="whisper-server">whisper.cpp (remote)</option>
          <option value="google-cloud">Google Cloud</option>
          <option value="microsoft-azure">Azure Cognitive Services</option>
          <option value="amazon-transcribe">Amazon Transcribe</option>
          <option value="openai-cloud">OpenAI Cloud Platform</option>
          <option value="deepgram">Deepgram Speech to Text</option>
        </NativeSelect>
        {state.transcriptionEngine === "whisper.cpp" && (
          <Stack>
            <Text className="text-sm opacity-70">
              Using whisper.cpp variant: <Code>{whisperVariant ?? "cpu"}</Code>.
              To use a different variant (e.g. with GPU acceleration), install a
              different Storyteller image.
            </Text>
            <Text className="text-sm opacity-70">
              You can specify which Whisper model Storyteller should use for
              transcription. The default (tiny) is sufficient for most English
              books. For books with many uncommon words, or in languages other
              than English, you may need to try larger models, such as small or
              medium.
            </Text>
            <NativeSelect
              label="Whisper model"
              {...form.getInputProps("whisperModel")}
            >
              <option value="tiny">tiny</option>
              <option value="tiny.en">tiny.en</option>
              <option value="tiny-q5_1">tiny-q5_1</option>
              <option value="base">base</option>
              <option value="base.en">base.en</option>
              <option value="base-q5_1">base-q5_1</option>
              <option value="small">small</option>
              <option value="small.en">small.en</option>
              <option value="small-q5_1">small-q5_1</option>
              <option value="medium">medium</option>
              <option value="medium.en">medium.en</option>
              <option value="medium-q5_0">medium-q5_0</option>
              <option value="large-v1">large-v1</option>
              <option value="large-v2">large-v2</option>
              <option value="large-v2-q5_0">large-v2-q5_0</option>
              <option value="large-v3">large-v3</option>
              <option value="large-v3-q5_0">large-v3-q5_0</option>
              <option value="large-v3-turbo">large-v3-turbo</option>
              <option value="large-v3-turbo-q5_0">large-v3-turbo-q5_0</option>
            </NativeSelect>
            <NumberInput
              label={
                <div className="flex items-center gap-0">
                  <IconFlame
                    className="mr-2 inline-block fill-orange-600 text-orange-600"
                    size={16}
                  />
                  Turbo mode
                </div>
              }
              description={
                <>
                  <Text size="sm">
                    Change the parallelization level of the Whisper model. Can
                    result in a massive speed increase when doing
                    GPU-accelerated transcription.
                  </Text>
                  <Text size="sm">
                    It is not recommended to set both this value and the
                    &quot;Number of audio tracks to process in parallel&quot;
                    value to a value greater than 1. Choose one or the other.
                  </Text>
                </>
              }
              min={1}
              max={16}
              {...form.getInputProps("whisperThreads")}
            />

            <Text size="sm" className="opacity-70">
              <span className="font-bold text-orange-600">Warning!</span>{" "}
              Setting above 1 may reduce transcription accuracy but increases
              speed by splitting audio into chunks processed in parallel. Do not
              report bugs if you set this to a value greater than 1 and are not
              able to get a consistent Readaloud, only if you cannot get a
              consistent Readaloud even with a value of 1.
            </Text>
            <NativeSelect
              label="CPU fallback"
              description="If you have a GPU variant installed but want to fall back to CPU transcription, select a CPU variant here. This will download and use the selected CPU variant instead of the GPU variant."
              value={state.whisperCpuFallback ?? ""}
              onChange={(e) => {
                const val = e.currentTarget.value
                form.setFieldValue(
                  "whisperCpuFallback",
                  val === "" ? null : (val as "blas" | "cpu"),
                )
              }}
            >
              <option value="">Use default (GPU if available)</option>
              <option value="blas">OpenBLAS (optimized CPU)</option>
              <option value="cpu">Plain CPU</option>
            </NativeSelect>
            {/* <Switch
              label="Auto-detect language"
              description="When enabled, Storyteller will attempt to detect the language of the audio instead of using the book's language metadata. This will slow down transcription."
              {...form.getInputProps("autoDetectLanguage", {
                type: "checkbox",
              })}
            />
            <Fieldset
              legend="Per-language model overrides"
              className="mt-4"
              disabled={!state.autoDetectLanguage}
            >
              <Box className="mb-3 text-sm opacity-70">
                <p>
                  You can specify different Whisper models for specific
                  languages. For example, use <Code>tiny.en</Code> for English
                  and <Code>large-v3-turbo</Code> for other languages.
                </p>
                {!state.autoDetectLanguage && (
                  <p className="mt-2 font-medium">
                    Enable auto-detect language above to use per-language model
                    overrides.
                  </p>
                )}
              </Box>
              <Stack gap={8}>
                {Object.entries(state.whisperModelOverrides).map(
                  ([lang, model]) => (
                    <Group key={lang} gap={8}>
                      <NativeSelect
                        label="Language"
                        value={lang}
                        className="flex-1"
                        onChange={(e) => {
                          const newKey = e.currentTarget.value as Language
                          const newOverrides = Object.fromEntries(
                            Object.entries(state.whisperModelOverrides).map(
                              ([k, v]) => (k === lang ? [newKey, v] : [k, v]),
                            ),
                          ) as Record<Language, WhisperModel>
                          form.setFieldValue(
                            "whisperModelOverrides",
                            newOverrides,
                          )
                        }}
                      >
                        <option value="">Select language</option>
                        {LANGUAGES.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.label}
                          </option>
                        ))}
                      </NativeSelect>
                      <NativeSelect
                        label="Model"
                        value={model}
                        className="flex-1"
                        onChange={(e) => {
                          form.setFieldValue("whisperModelOverrides", {
                            ...state.whisperModelOverrides,
                            [lang]: e.currentTarget.value as WhisperModel,
                          })
                        }}
                      >
                        <option value="tiny">tiny</option>
                        <option value="tiny.en">tiny.en</option>
                        <option value="tiny-q5_1">tiny-q5_1</option>
                        <option value="base">base</option>
                        <option value="base.en">base.en</option>
                        <option value="base-q5_1">base-q5_1</option>
                        <option value="small">small</option>
                        <option value="small.en">small.en</option>
                        <option value="small-q5_1">small-q5_1</option>
                        <option value="medium">medium</option>
                        <option value="medium.en">medium.en</option>
                        <option value="medium-q5_0">medium-q5_0</option>
                        <option value="large-v1">large-v1</option>
                        <option value="large-v2">large-v2</option>
                        <option value="large-v2-q5_0">large-v2-q5_0</option>
                        <option value="large-v3">large-v3</option>
                        <option value="large-v3-q5_0">large-v3-q5_0</option>
                        <option value="large-v3-turbo">large-v3-turbo</option>
                        <option value="large-v3-turbo-q5_0">
                          large-v3-turbo-q5_0
                        </option>
                      </NativeSelect>
                      <ActionIcon
                        variant="subtle"
                        className="mt-6"
                        onClick={() => {
                          const newOverrides = Object.fromEntries(
                            Object.entries(state.whisperModelOverrides).filter(
                              ([k]) => k !== lang,
                            ),
                          ) as Record<Language, WhisperModel>
                          form.setFieldValue(
                            "whisperModelOverrides",
                            newOverrides,
                          )
                        }}
                      >
                        <IconTrash color="red" />
                      </ActionIcon>
                    </Group>
                  ),
                )}
                <Button
                  leftSection={<IconPlus />}
                  variant="outline"
                  className="self-start"
                  onClick={() => {
                    form.setFieldValue("whisperModelOverrides", {
                      ...state.whisperModelOverrides,
                      en: "tiny" as WhisperModel,
                    })
                  }}
                >
                  Add override
                </Button>
              </Stack>
            </Fieldset> */}
          </Stack>
        )}
        {state.transcriptionEngine === "google-cloud" && (
          <TextInput
            label="API key"
            withAsterisk
            {...form.getInputProps("googleCloudApiKey")}
          />
        )}
        {state.transcriptionEngine === "microsoft-azure" && (
          <>
            <TextInput
              label="Subscription key"
              withAsterisk
              {...form.getInputProps("azureSubscriptionKey")}
            />
            <TextInput
              label="Service region key"
              withAsterisk
              {...form.getInputProps("azureServiceRegion")}
            />
          </>
        )}
        {state.transcriptionEngine === "amazon-transcribe" && (
          <>
            <TextInput
              label="Region"
              withAsterisk
              {...form.getInputProps("amazonTranscribeRegion")}
            />
            <TextInput
              label="Bucket name"
              withAsterisk
              description={
                <>
                  <Text size="sm">
                    Amazon Transcribe’s batch transcription job API requires
                    that files are uploaded to an S3 bucket before starting the
                    transcribe job. This is the bucket that Storyteller will
                    upload files to.
                  </Text>
                </>
              }
              {...form.getInputProps("amazonTranscribeBucketName")}
            />
            <TextInput
              label="Access key id"
              withAsterisk
              {...form.getInputProps("amazonTranscribeAccessKeyId")}
            />
            <TextInput
              label="Secret access key"
              withAsterisk
              {...form.getInputProps("amazonTranscribeSecretAccessKey")}
            />
          </>
        )}
        {state.transcriptionEngine === "openai-cloud" && (
          <>
            <TextInput
              label="API Key"
              withAsterisk
              {...form.getInputProps("openAiApiKey")}
            />
            <TextInput
              label="Organization (optional)"
              {...form.getInputProps("openAiOrganization")}
            />
            <TextInput
              label="Base URL (optional)"
              description={
                <>
                  You can use a custom base URL to point at a OpenAI
                  Cloud-compatible service URL, such as a self-hosted{" "}
                  <a
                    className="text-st-orange-800 underline"
                    href="https://github.com/speaches-ai/speaches"
                  >
                    speaches
                  </a>{" "}
                  instance, or a remote{" "}
                  <a
                    className="text-st-orange-800 underline"
                    href="https://github.com/ggml-org/whisper.cpp/tree/master/examples/server"
                  >
                    whisper.cpp HTTP server (we recommend using the `whisper.cpp
                    (remote)` setting for that instead)
                  </a>
                  .
                </>
              }
              {...form.getInputProps("openAiBaseUrl")}
            />
            <TextInput
              label="Model name (optional)"
              description={
                <>
                  e.g. <Code>Systran/faster-distil-whisper-large-v3</Code> for
                  faster-whisper-server&rsquo;s large-v3 model, or{" "}
                  <Code>whisper-1</Code> for large-v3 on OpenAI Cloud. Warning:
                  do not use non-whisper models here, such as{" "}
                  <Code>openai-4o</Code>, as the timeline will not be generated
                  correctlye
                </>
              }
              {...form.getInputProps("openAiModelName")}
            />
          </>
        )}
        {state.transcriptionEngine === "whisper-server" && (
          <>
            <Text size="sm">
              Use a remote, self-hosted `whisper.cpp` server for transcription.
              Useful if you have a powerful machine to offload transcription to.
              See our{" "}
              <a href="https://storyteller-platform.gitlab.io/storyteller/docs/tutorials/offloading-transcription">
                offloading transcription guide
              </a>{" "}
              for more information.
            </Text>
            <TextInput
              label="Server URL"
              description={
                <>
                  e.g. <Code>http://192.168.1.19:8080</Code> for the local
                  whisper.cpp server.
                </>
              }
              withAsterisk
              {...form.getInputProps("whisperServerUrl")}
            />
            <TextInput
              description={
                <>Only necessary if your server requires an API key.</>
              }
              label="API Key"
              {...form.getInputProps("whisperServerApiKey")}
            />
          </>
        )}
        {state.transcriptionEngine === "deepgram" && (
          <>
            <TextInput
              label="API Key"
              withAsterisk
              {...form.getInputProps("deepgramApiKey")}
            />
            <TextInput
              label="Model name"
              description={
                <>
                  Can be any model the server supports, like <Code>nova-3</Code>
                  , <Code>nova-2</Code>,<Code>nova</Code>, <Code>enhanced</Code>
                  , <Code>base</Code> or <Code>whisper</Code> (see model list{" "}
                  <a
                    href="https://developers.deepgram.com/docs/model"
                    rel="nofollow"
                  >
                    here
                  </a>
                  ). Defaults to <Code>nova-3</Code>
                </>
              }
              {...form.getInputProps("deepgramModel")}
            />
          </>
        )}
      </Fieldset>
      <Fieldset legend="Parellelization settings">
        <Box className="mb-3 text-sm opacity-70">
          <p>
            Since Storyteller splits audiobooks into multiple tracks, it&apos;s
            possible to run transcoding and transcription on multiple tracks in
            parallel.
          </p>
        </Box>
        <NumberInput
          label="Number of audio tracks to transcode in parallel"
          description="Transcoding one track will use on CPU core"
          {...form.getInputProps("parallelTranscodes")}
        />
        <NumberInput
          label="Number of audio tracks to transcribe in parallel"
          description="Transcribing one track will use up to 4 CPU cores (when using CPU-based transcription)"
          {...form.getInputProps("parallelTranscribes")}
        />
      </Fieldset>
      <Fieldset legend="Authentication providers">
        <Stack gap={4} className="my-4">
          {state.authProviders.map((provider, i) => (
            <Fieldset
              key={i}
              legend="Provider"
              className="relative bg-white pt-10 dark:bg-neutral-800"
            >
              <Select
                {...form.getInputProps(`authProviders.${i}.kind`)}
                onChange={(value) => {
                  if (value === "built-in") {
                    form.replaceListItem("authProviders", i, {
                      kind: "built-in",
                      id: "keycloak",
                      issuer: "",
                      clientId: "",
                      clientSecret: "",
                    })
                  } else {
                    form.replaceListItem("authProviders", i, {
                      kind: "custom",
                      name: "",
                      issuer: "",
                      clientId: "",
                      clientSecret: "",
                      type: "oidc",
                    })
                  }
                }}
                required
                withAsterisk
                data={[
                  { value: "built-in", label: "Built-in" },
                  { value: "custom", label: "Custom" },
                ]}
              />
              {provider.kind === "built-in" ? (
                <AuthProviderInput
                  value={provider.id}
                  onChange={(value) => {
                    form.replaceListItem("authProviders", i, {
                      ...provider,
                      id: value,
                    })
                  }}
                />
              ) : (
                <TextInput
                  label="Name"
                  required
                  withAsterisk
                  {...form.getInputProps(`authProviders.${i}.name`)}
                />
              )}

              <Text>
                Set callback URL to {authUrlPath}
                /callback/
                {(provider.kind === "custom" ? provider.name : provider.id)
                  .toLowerCase()
                  .replaceAll(/ +/g, "-")
                  .replaceAll(/[^a-zA-Z0-9-]/g, "")}
              </Text>
              {provider.kind === "custom" && (
                <>
                  <Select
                    label="Provider type"
                    required
                    withAsterisk
                    {...form.getInputProps(`authProviders.${i}.type`)}
                    defaultValue="oidc"
                    data={[
                      { value: "oidc", label: "OIDC" },
                      { value: "oauth", label: "OAuth" },
                    ]}
                  />
                </>
              )}
              <TextInput
                label="Issuer"
                required={provider.kind === "custom"}
                withAsterisk={provider.kind === "custom"}
                description={
                  provider.kind === "built-in" ? (
                    <>
                      Only required for some providers. Look up your provider in{" "}
                      <Anchor
                        className="text-sm"
                        href="https://authjs.dev/reference/core/providers"
                      >
                        the Auth.js docs
                      </Anchor>{" "}
                      for more information.
                    </>
                  ) : undefined
                }
                placeholder="https://auth.example.com"
                {...form.getInputProps(`authProviders.${i}.issuer`)}
              />
              <TextInput
                label="Client ID"
                required
                withAsterisk
                {...form.getInputProps(`authProviders.${i}.clientId`)}
              />
              <PasswordInput
                label="Client secret"
                required
                withAsterisk
                {...form.getInputProps(`authProviders.${i}.clientSecret`)}
              />
              {provider.kind === "custom" && (
                <>
                  <Switch
                    label="Allow registration"
                    description="Automatically create accounts for new users from this provider"
                    {...form.getInputProps(
                      `authProviders.${i}.allowRegistration`,
                      {
                        type: "checkbox",
                      },
                    )}
                  />
                  {provider.allowRegistration && (
                    <Fieldset legend="Group Permissions" className="mt-2">
                      <Text className="mb-2 text-sm text-gray-600">
                        Map OIDC groups to permissions. If specified, users not
                        in any listed group will be denied access.
                      </Text>
                      <Stack gap="sm">
                        {Object.entries(provider.groupPermissions ?? {}).map(
                          ([groupName, permissions], idx) => {
                            const setPerms = (perms: string[]) => {
                              form.setFieldValue(
                                `authProviders.${i}.groupPermissions`,
                                {
                                  ...provider.groupPermissions,
                                  [groupName]: perms,
                                },
                              )
                            }
                            return (
                              <Box
                                key={idx}
                                className="relative rounded border p-3"
                              >
                                <TextInput
                                  label="Group name"
                                  value={groupName}
                                  onChange={(e) => {
                                    const newName = e.target.value
                                    const { [groupName]: perms, ...rest } =
                                      provider.groupPermissions ?? {}
                                    // Prevent overwriting existing group
                                    if (
                                      newName !== groupName &&
                                      newName in rest
                                    )
                                      return

                                    form.setFieldValue(
                                      `authProviders.${i}.groupPermissions`,
                                      { ...rest, [newName]: perms ?? [] },
                                    )
                                  }}
                                  className="mb-2"
                                />
                                <Box className="mb-1 flex justify-end gap-1">
                                  <Button
                                    variant="subtle"
                                    size="xs"
                                    onClick={() => {
                                      setPerms([...ADMIN_PERMISSIONS])
                                    }}
                                  >
                                    Admin
                                  </Button>
                                  <Button
                                    variant="subtle"
                                    size="xs"
                                    onClick={() => {
                                      setPerms([...BASIC_PERMISSIONS])
                                    }}
                                  >
                                    Basic
                                  </Button>
                                </Box>
                                <MultiSelect
                                  label="Permissions"
                                  data={PERMISSIONS_VALUES}
                                  value={permissions}
                                  onChange={setPerms}
                                />
                                <ActionIcon
                                  variant="subtle"
                                  className="absolute top-1 right-1"
                                  size="sm"
                                  onClick={() => {
                                    const { [groupName]: _, ...rest } =
                                      provider.groupPermissions ?? {}
                                    form.setFieldValue(
                                      `authProviders.${i}.groupPermissions`,
                                      Object.keys(rest).length > 0
                                        ? rest
                                        : undefined,
                                    )
                                  }}
                                >
                                  <IconTrash size={14} color="red" />
                                </ActionIcon>
                              </Box>
                            )
                          },
                        )}
                        <Button
                          leftSection={<IconPlus size={14} />}
                          variant="outline"
                          size="xs"
                          className="self-start"
                          onClick={() => {
                            const existing = provider.groupPermissions ?? {}
                            // Use empty string; user must provide a name
                            if ("" in existing) return
                            form.setFieldValue(
                              `authProviders.${i}.groupPermissions`,
                              { ...existing, "": [...BASIC_PERMISSIONS] },
                            )
                          }}
                        >
                          Add group
                        </Button>
                      </Stack>
                    </Fieldset>
                  )}
                </>
              )}
              <ActionIcon
                variant="subtle"
                className="absolute top-0 right-4"
                onClick={() => {
                  form.removeListItem("authProviders", i)
                }}
              >
                <IconTrash color="red" />
              </ActionIcon>
            </Fieldset>
          ))}
          <Button
            leftSection={<IconPlus />}
            variant="outline"
            mt="sm"
            className="self-start"
            onClick={() => {
              form.insertListItem("authProviders", {
                kind: "built-in",
                id: "keycloak",
                clientId: "",
                clientSecret: "",
                issuer: "",
              })
            }}
          >
            Add provider
          </Button>
          <Switch
            label="Disable password login"
            description={
              canDisablePassword
                ? "Only allow login via configured authentication providers. Most OPDS clients do not support OAuth."
                : "Requires an auth provider with a group that can change server settings"
            }
            mt="md"
            disabled={!canDisablePassword}
            {...form.getInputProps("disablePasswordLogin", {
              type: "checkbox",
            })}
          />
        </Stack>
      </Fieldset>
      <Fieldset legend="Upload settings">
        <Stack>
          {maxUploadChunkSize?.overriden && (
            <Text className="text-sm">
              Your max chunk size is overriden via the environment variable{" "}
              <code>STORYTELLER_MAX_UPLOAD_CHUNK_SIZE</code>. Change that
              environment variable to change the value, or unset it to configure
              the value here in the settings.
            </Text>
          )}
          <Switch
            label="Enable max chunk size"
            description="Don’t enable this unless you’re running into maximum request size issues with your reverse proxy or hosting provider."
            disabled={maxUploadChunkSize?.overriden ?? false}
            checked={state.maxUploadChunkSize !== null}
            onChange={(event) => {
              const value = event.currentTarget.checked
              if (value) {
                form.setFieldValue("maxUploadChunkSize", 100_000_000)
              } else {
                form.setFieldValue("maxUploadChunkSize", null)
              }
            }}
          />
          {state.maxUploadChunkSize !== null && (
            <NumberInput
              label="Max chunk size"
              description="Size in bytes. Default is 100MB, which is Cloudfare’s maximum request size."
              disabled={maxUploadChunkSize?.overriden ?? false}
              value={state.maxUploadChunkSize}
              {...form.getInputProps("maxUploadChunkSize")}
            />
          )}
        </Stack>
      </Fieldset>
      <Fieldset legend="OPDS settings">
        <Stack>
          <Switch
            label="Enable OPDS feed"
            description={`OPDS allows compatible e-reader apps to browse and download books from your library. It can be accessed at ${opdsUrl}.`}
            checked={state.opdsEnabled ?? true}
            onChange={(event) => {
              form.setFieldValue("opdsEnabled", event.currentTarget.checked)
            }}
          />
          <Switch
            label="Enable pagination"
            description="Some OPDS clients don't handle pagination well. Disable this to return all items in a single response."
            checked={state.opdsPageSize !== null}
            onChange={(event) => {
              const value = event.currentTarget.checked
              if (value) {
                form.setFieldValue("opdsPageSize", 50)
              } else {
                form.setFieldValue("opdsPageSize", null)
              }
            }}
          />
          {state.opdsPageSize !== null && (
            <NumberInput
              label="Page size"
              description="Number of items per page in OPDS feeds."
              min={1}
              max={500}
              {...form.getInputProps("opdsPageSize")}
            />
          )}
        </Stack>
      </Fieldset>
      <Fieldset legend="Email settings">
        <TextInput label="SMTP host" {...form.getInputProps("smtpHost")} />
        <TextInput
          label="SMTP port"
          type="number"
          {...form.getInputProps("smtpPort")}
        />
        <TextInput label="SMTP from" {...form.getInputProps("smtpFrom")} />
        <TextInput
          label="SMTP username"
          {...form.getInputProps("smtpUsername")}
        />
        <PasswordInput
          label="SMTP password"
          {...form.getInputProps("smtpPassword")}
        />
        <Checkbox
          label="SMTP - Force TLS?"
          className="my-4"
          description={
            <>
              <p>
                <strong>Note:</strong> Disabling this option does not disable
                TLS. By default, Storyteller will use STARTTLS to negotiate a
                TLS connection. Many SMTP servers require TLS negotiation in
                order to establish the correct TLS version to use.
              </p>
              <p>
                If you have this option enabled and see an error in your logs
                about an incorrect TLS version, try disabling it.
              </p>
            </>
          }
          {...form.getInputProps("smtpSsl", { type: "checkbox" })}
        />
        <Checkbox
          label="SMTP - Reject self-signed TLS certs?"
          {...(form.getInputProps("smtpRejectUnauthorized"),
          { type: "checkbox" })}
        />
      </Fieldset>
      <Group
        justify="flex-end"
        className="sticky bottom-0 z-10 bg-white p-6 dark:bg-neutral-800"
      >
        <Button type="submit">{saved ? "Saved!" : "Update"}</Button>
      </Group>
    </form>
  )
}
