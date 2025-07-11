"use client"

import { Settings } from "@/apiModels"
import { useRef, useState } from "react"
import { useForm } from "@mantine/form"
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
  NativeSelect,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { AuthProviderInput } from "./AuthProviderInput"
import { useUpdateSettingsMutation } from "@/store/api"

interface Props {
  settings: Settings
}

export function SettingsForm({ settings }: Props) {
  const [saved, setSaved] = useState(false)
  const clearSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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
    whisperBuild: settings.whisperBuild ?? "cpu",
    whisperModel: settings.whisperModel ?? "tiny",
    googleCloudApiKey: settings.googleCloudApiKey ?? "",
    azureSubscriptionKey: settings.azureSubscriptionKey ?? "",
    azureServiceRegion: settings.azureServiceRegion ?? "",
    amazonTranscribeRegion: settings.amazonTranscribeRegion ?? "",
    amazonTranscribeAccessKeyId: settings.amazonTranscribeAccessKeyId ?? "",
    amazonTranscribeSecretAccessKey:
      settings.amazonTranscribeSecretAccessKey ?? "",
    openAiApiKey: settings.openAiApiKey ?? "",
    openAiOrganization: settings.openAiOrganization ?? "",
    openAiBaseUrl: settings.openAiBaseUrl ?? "",
    openAiModelName: settings.openAiModelName ?? "",
    deepgramApiKey: settings.deepgramApiKey ?? "",
    deepgramModel: settings.deepgramModel ?? "nova-3",
    parallelTranscribes: settings.parallelTranscribes,
    parallelTranscodes: settings.parallelTranscodes,
    parallelWhisperBuild: settings.parallelWhisperBuild,
    authProviders: settings.authProviders,
  }

  const form = useForm({
    mode: "controlled",
    initialValues,
  })

  const state = form.values

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
          {...form.getInputProps("library_name")}
        />
        <TextInput label="Web URL" {...form.getInputProps("web_url")} />
      </Fieldset>
      <Fieldset legend="Audio settings">
        <NativeSelect
          label="Maximum processed track length"
          description={
            <span className="text-black opacity-70">
              Audio tracks longer than this will be split to be this length or
              shorter before transcribing.
              <br />
              This can help with reducing Storyteller&rsquo;s memory usage
              during transcription.
            </span>
          }
          {...form.getInputProps("max_track_length")}
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
            <option value="0">0</option>
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
            locally, using your server&apos;s hardware. If you would prefer to
            run the task via a paid third-party service, you set that with the
            &quot;transcription engine&quot; setting below.
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
          {...form.getInputProps("transcription_engine")}
        >
          <option value="whisper.cpp">whisper.cpp (local)</option>
          <option value="google-cloud">Google Cloud</option>
          <option value="microsoft-azure">Azure Cognitive Services</option>
          <option value="amazon-transcribe">Amazon Transcribe</option>
          <option value="openai-cloud">OpenAI Cloud Platform</option>
          <option value="deepgram">Deepgram Speech to Text</option>
        </NativeSelect>
        {state.transcriptionEngine === "whisper.cpp" && (
          <>
            <NativeSelect
              label="Whisper build"
              {...form.getInputProps("whisper_build")}
            >
              <option value="cpu">CPU</option>
              <option value="cublas-11.8">cuBLAS 11.8 (NVIDIA GPU)</option>
              <option value="cublas-12.6">cuBLAS 12.6 (NVIDIA GPU)</option>
              <option value="hipblas">hipBLAS (AMD GPU)</option>
            </NativeSelect>
            <Box className="text-sm opacity-70">
              <p>
                You can also specify which Whisper model Storyteller should use
                for transcription. The default (tiny) is sufficient for most
                English books. For books with many uncommon words, or in
                languages other than English, you may need to try larger models,
                such as small or medium.
              </p>
            </Box>
            <NativeSelect
              label="Whisper model"
              {...form.getInputProps("whisper_model")}
            >
              <option value="tiny">tiny</option>
              <option value="tiny-q5_1">tiny-q5_1</option>
              <option value="base">base</option>
              <option value="base-q5_1">base-q5_1</option>
              <option value="small">small</option>
              <option value="small-q5_1">small-q5_1</option>
              <option value="medium">medium</option>
              <option value="medium-q5_0">medium-q5_0</option>
              <option value="large-v1">large-v1</option>
              <option value="large-v2">large-v2</option>
              <option value="large-v2-q5_0">large-v2-q5_0</option>
              <option value="large-v3">large-v3</option>
              <option value="large-v3-q5_0">large-v3-q5_0</option>
              <option value="large-v3-turbo">large-v3-turbo</option>
              <option value="large-v3-turbo-q5_0">large-v3-turbo-q5_0</option>
            </NativeSelect>
          </>
        )}
        {state.transcriptionEngine === "google-cloud" && (
          <TextInput
            label="API key"
            withAsterisk
            {...form.getInputProps("google_cloud_api_key")}
          />
        )}
        {state.transcriptionEngine === "microsoft-azure" && (
          <>
            <TextInput
              label="Subscription key"
              withAsterisk
              {...form.getInputProps("azure_subscription_key")}
            />
            <TextInput
              label="Service region key"
              withAsterisk
              {...form.getInputProps("azure_service_region")}
            />
          </>
        )}
        {state.transcriptionEngine === "amazon-transcribe" && (
          <>
            <TextInput
              label="Region"
              withAsterisk
              {...form.getInputProps("amazon_transcribe_region")}
            />
            <TextInput
              label="Access key id"
              withAsterisk
              {...form.getInputProps("amazon_transcribe_access_key_id")}
            />
            <TextInput
              label="Secret access key"
              withAsterisk
              {...form.getInputProps("amazon_transcribe_secret_access_key")}
            />
          </>
        )}
        {state.transcriptionEngine === "openai-cloud" && (
          <>
            <TextInput
              label="API Key"
              withAsterisk
              {...form.getInputProps("open_ai_api_key")}
            />
            <TextInput
              label="Organization (optional)"
              {...form.getInputProps("open_ai_organization")}
            />
            <TextInput
              label="Base URL (optional)"
              description={
                <>
                  You can use a custom base URL to point at a OpenAI
                  Cloud-compatible service URL, such as a self-hosted{" "}
                  <a
                    className="text-st-orange-800 underline"
                    href="https://github.com/fedirz/faster-whisper-server"
                  >
                    faster-whisper-server
                  </a>{" "}
                  instance.
                </>
              }
              {...form.getInputProps("open_ai_base_url")}
            />
            <TextInput
              label="Model name (optional)"
              description={
                <>
                  e.g. <Code>Systran/faster-distil-whisper-large-v3</Code> for
                  faster-whisper-server&rsquo;s large-v3 model, or{" "}
                  <Code>whisper-1</Code> for large-v3 on OpenAI Cloud.
                </>
              }
              {...form.getInputProps("open_ai_model_name")}
            />
          </>
        )}
        {state.transcriptionEngine === "deepgram" && (
          <>
            <TextInput
              label="API Key"
              withAsterisk
              {...form.getInputProps("deepgram_api_key")}
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
              {...form.getInputProps("deepgram_model")}
            />
          </>
        )}
      </Fieldset>
      <Fieldset legend="Parellelization settings">
        <Box className="mb-3 text-sm opacity-70">
          <p>
            Audio transcoding is an inherently single-threaded task, and
            Whisper’s transcription engine has diminishing returns on multi-core
            processing for a single file.
          </p>
          <p>
            However, since Storyteller splits input audio into multiple tracks,
            it’s possible to run transcoding and transcription on multiple
            tracks in parallel.
          </p>
        </Box>
        <NumberInput
          label="Number of audio tracks to transcode in parallel"
          description="Transcoding one track will use on CPU core"
          {...form.getInputProps("parallel_transcodes")}
        />
        <NumberInput
          label="Number of audio tracks to transcribe in parallel"
          description="Transcribing one track will use up to 4 CPU cores (when using CPU-based transcription)"
          {...form.getInputProps("parallel_transcribes")}
        />
        <Box className="mb-3 text-sm opacity-70">
          <p>
            Whenever the Storyteller container is recreated (e.g. after an
            update), it will rebuild whisper.cpp. This process can be sped up
            considerably by dedicating multiple CPU cores.
          </p>
        </Box>
        <NumberInput
          label="Number of CPU cores to allocate for building whisper.cpp locally"
          {...form.getInputProps("parallel_whisper_build")}
        />
      </Fieldset>
      <Fieldset legend="Authentication providers">
        <Stack gap={4} className="my-4">
          {state.authProviders.map((provider, i) => (
            <Fieldset
              key={i}
              legend="Provider"
              className="relative bg-white pt-10"
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
              {provider.kind === "custom" && (
                <>
                  <Text>
                    Set callback URL to {state.webUrl}/api/v2/auth/callback/
                    {provider.name
                      .toLowerCase()
                      .replaceAll(/ +/g, "-")
                      .replaceAll(/[^a-zA-Z0-9-]/g, "")}
                  </Text>
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
              <ActionIcon
                variant="subtle"
                className="absolute right-4 top-0"
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
        </Stack>
      </Fieldset>
      <Fieldset legend="Email settings">
        <TextInput label="SMTP host" {...form.getInputProps("smtp_host")} />
        <TextInput
          label="SMTP port"
          type="number"
          {...form.getInputProps("smtp_port")}
        />
        <TextInput label="SMTP from" {...form.getInputProps("smtp_from")} />
        <TextInput
          label="SMTP username"
          {...form.getInputProps("smtp_username")}
        />
        <PasswordInput
          label="SMTP password"
          {...form.getInputProps("smtp_password")}
        />
        <Checkbox
          label="SMTP - Enable SSL?"
          className="my-4"
          description={
            <>
              <strong>Note:</strong> Only disable SSL and self-signed cert
              rejection if you use a locally hosted SMTP server. If you need to
              connect over the internet, keep SSL enabled!
            </>
          }
          {...form.getInputProps("smtp_ssl", { type: "checkbox" })}
        />
        <Checkbox
          label="SMTP - Reject self-signed TLS certs?"
          {...(form.getInputProps("smtp_reject_unauthorized"),
          { type: "checkbox" })}
        />
      </Fieldset>
      <Group justify="flex-end" className="sticky bottom-0 z-10 bg-white p-6">
        <Button type="submit">{saved ? "Saved!" : "Update"}</Button>
      </Group>
    </form>
  )
}
