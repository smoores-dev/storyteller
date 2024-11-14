"use client"

import { Settings } from "@/apiModels"

import styles from "./settingsform.module.css"
import {
  Form,
  FormCheckbox,
  FormInput,
  FormLabel,
  FormSubmit,
  useFormStore,
} from "@ariakit/react"
import { useApiClient } from "@/hooks/useApiClient"
import { useRef, useState } from "react"

interface Props {
  settings: Settings
}

export function SettingsForm({ settings }: Props) {
  const [saved, setSaved] = useState(false)
  const clearSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const client = useApiClient()
  const form = useFormStore({ defaultValues: settings })

  form.useSubmit(async (state) => {
    await client.updateSettings(state.values)
    setSaved(true)
    if (clearSavedTimeoutRef.current) {
      clearTimeout(clearSavedTimeoutRef.current)
    }
    clearSavedTimeoutRef.current = setTimeout(() => {
      setSaved(false)
    }, 2000)
  })

  const transcriptionEngine =
    form.useValue<Settings["transcription_engine"]>(
      form.names["transcription_engine"],
    ) ?? "whisper.cpp"

  const codec = form.useValue<Settings["codec"]>(form.names["codec"])

  const openAiBaseUrl = form.useValue<Settings["open_ai_base_url"]>(
    form.names["open_ai_base_url"],
  )

  return (
    <Form
      className={styles["settings-form"]}
      resetOnSubmit={false}
      store={form}
    >
      <fieldset>
        <legend>Library settings</legend>
        <FormLabel name={form.names["library_name"]}>
          Library name
          <FormInput name={form.names["library_name"]} />
        </FormLabel>
        <FormLabel name={form.names["web_url"]}>
          Web URL
          <FormInput name={form.names["web_url"]} />
        </FormLabel>
      </fieldset>
      <fieldset>
        <legend>Audio settings</legend>
        <FormLabel name={form.names["codec"]}>
          Preferred audio codec
          <FormInput
            name={form.names["codec"]}
            render={<select />}
            defaultValue={settings["codec"] ?? ""}
          >
            <option value="">Default</option>
            <option value="libopus">OPUS</option>
            <option value="libmp3lame">MP3</option>
            <option value="aac">AAC</option>
          </FormInput>
        </FormLabel>
        {codec === "libopus" && (
          <FormLabel name={form.names["bitrate"]}>
            Preferred audio bitrate
            <FormInput
              name={form.names["bitrate"]}
              render={<select />}
              defaultValue={settings["bitrate"] ?? ""}
            >
              <option value="">Default (32 Kb/s)</option>
              <option value="16K">16 Kb/s</option>
              <option value="24K">24 Kb/s</option>
              <option value="32K">32 Kb/s</option>
              <option value="64K">64 Kb/s</option>
              <option value="96K">96 Kb/s</option>
            </FormInput>
          </FormLabel>
        )}
        {codec === "libmp3lame" && (
          <FormLabel name={form.names["bitrate"]}>
            Preferred audio quality
            <FormInput
              name={form.names["bitrate"]}
              render={<select />}
              defaultValue={settings["bitrate"] ?? ""}
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
            </FormInput>
          </FormLabel>
        )}
      </fieldset>
      <fieldset>
        <legend>Transcription settings</legend>
        <p>
          As part of the synchronization process, Storyteller attempts to
          transcribe the audiobook narration to text.
        </p>
        <p>
          This is by far the most resource-intensive phase of the process. By
          default, Storyteller will attempt to run the transcription job
          locally, using your server&apos;s hardware. If you would prefer to run
          the task via a paid third-party service, you set that with the
          &quot;transcription engine&quot; setting below.
        </p>
        <p>The available paid transcription services are:</p>
        <ul>
          <li>
            <a href="https://cloud.google.com/text-to-speech">Google Cloud</a>
          </li>
          <li>
            <a href="https://cloud.google.com/speech-to-text" rel="nofollow">
              Google Cloud
            </a>
          </li>
          <li>
            <a
              href="https://azure.microsoft.com/en-us/products/ai-services/speech-to-text/"
              rel="nofollow"
            >
              Azure Cognitive Services
            </a>
          </li>
          <li>
            <a href="https://aws.amazon.com/transcribe/" rel="nofollow">
              Amazon Transcribe
            </a>
          </li>
          <li>
            <a href="https://platform.openai.com/" rel="nofollow">
              OpenAI Cloud Platform
            </a>
          </li>
        </ul>
        <FormLabel name={form.names["transcription_engine"]}>
          Transcription engine
          <FormInput
            name={form.names["transcription_engine"]}
            render={<select />}
            defaultValue={settings["transcription_engine"] ?? "whisper.cpp"}
          >
            <option value="whisper.cpp">whisper.cpp (local)</option>
            <option value="google-cloud">Google Cloud</option>
            <option value="microsoft-azure">Azure Cognitive Services</option>
            <option value="amazon-transcribe">Amazon Transcribe</option>
            <option value="openai-cloud">OpenAI Cloud Platform</option>
          </FormInput>
        </FormLabel>
        {transcriptionEngine === "whisper.cpp" && (
          <>
            <FormLabel name={form.names["whisper_build"]}>
              Whisper build
              <FormInput
                name={form.names["whisper_build"]}
                render={<select />}
                defaultValue={settings["whisper_build"] ?? "cpu"}
              >
                <option value="cpu">CPU</option>
                <option value="openblas">OpenBLAS (CPU, accelerated)</option>
                <option value="cublas-11.8">cuBLAS 11.8 (NVIDIA GPU)</option>
                <option value="cublas-12.4">cuBLAS 12.4 (NVIDIA GPU)</option>
              </FormInput>
            </FormLabel>
            <p>
              You can also specify which Whisper model Storyteller should use
              for transcription. The default (tiny) is sufficient for most
              English books. For books with many uncommon words, or in languages
              other than English, you may need to try larger models, such as
              small or medium.
            </p>
            <FormLabel name={form.names["whisper_model"]}>
              Whisper model
              <FormInput
                name={form.names["whisper_model"]}
                render={<select />}
                defaultValue={settings["whisper_model"] ?? "tiny"}
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
              </FormInput>
            </FormLabel>
          </>
        )}
        {transcriptionEngine === "google-cloud" && (
          <>
            <FormLabel name={form.names["google_cloud_api_key"]}>
              API key (required)
              <FormInput name={form.names["google_cloud_api_key"]} required />
            </FormLabel>
          </>
        )}
        {transcriptionEngine === "microsoft-azure" && (
          <>
            <FormLabel name={form.names["azure_subscription_key"]}>
              Subscription key (required)
              <FormInput name={form.names["azure_subscription_key"]} required />
            </FormLabel>
            <FormLabel name={form.names["azure_service_region"]}>
              Service region (required)
              <FormInput name={form.names["azure_service_region"]} required />
            </FormLabel>
          </>
        )}
        {transcriptionEngine === "amazon-transcribe" && (
          <>
            <FormLabel name={form.names["amazon_transcribe_region"]}>
              Region (required)
              <FormInput
                name={form.names["amazon_transcribe_region"]}
                required
              />
            </FormLabel>
            <FormLabel name={form.names["amazon_transcribe_access_key_id"]}>
              Access key id (required)
              <FormInput
                name={form.names["amazon_transcribe_access_key_id"]}
                required
              />
            </FormLabel>
            <FormLabel name={form.names["amazon_transcribe_secret_access_key"]}>
              Secret access key (required)
              <FormInput
                name={form.names["amazon_transcribe_secret_access_key"]}
                required
              />
            </FormLabel>
          </>
        )}
        {transcriptionEngine === "openai-cloud" && (
          <>
            <FormLabel name={form.names["open_ai_api_key"]}>
              API key (required)
              <FormInput name={form.names["open_ai_api_key"]} required />
            </FormLabel>
            <FormLabel name={form.names["open_ai_organization"]}>
              Organization (optional)
              <FormInput name={form.names["open_ai_organization"]} />
            </FormLabel>
            <FormLabel name={form.names["open_ai_base_url"]}>
              Base url (optional)
              <FormInput name={form.names["open_ai_base_url"]} />
            </FormLabel>
            {openAiBaseUrl && (
              <FormLabel name={form.names["open_ai_base_url"]}>
                Model name (e.g.
                &quot;Systran/faster-distil-whisper-large-v3&quot; for
                faster-whisper-server&rsquo;s large-v3 model)
                <FormInput name={form.names["open_ai_model_name"]} required />
              </FormLabel>
            )}
          </>
        )}
      </fieldset>
      <fieldset>
        <legend>Email settings</legend>
        <FormLabel name={form.names["smtp_host"]}>
          SMTP host
          <FormInput name={form.names["smtp_host"]} />
        </FormLabel>
        <FormLabel name={form.names["smtp_port"]}>
          SMTP port
          <FormInput name={form.names["smtp_port"]} type="number" />
        </FormLabel>
        <FormLabel name={form.names["smtp_from"]}>
          SMTP from
          <FormInput name={form.names["smtp_from"]} />
        </FormLabel>
        <FormLabel name={form.names["smtp_username"]}>
          SMTP username
          <FormInput name={form.names["smtp_username"]} />
        </FormLabel>
        <FormLabel name={form.names["smtp_password"]}>
          SMTP password
          <FormInput name={form.names["smtp_password"]} />
        </FormLabel>
        <FormLabel name={form.names["smtp_ssl"]}>
          SMTP - Enable SSL?
          <FormCheckbox name={form.names["smtp_ssl"]} />
        </FormLabel>
        <FormLabel name={form.names["smtp_reject_unauthorized"]}>
          SMTP - Reject self-signed TLS certs?
          <FormCheckbox name={form.names["smtp_reject_unauthorized"]} />
        </FormLabel>
        <p>
          <strong>Note:</strong> Only disable SSL and self-signed cert rejection
          if you use a locally hosted SMTP server. If you need to connect over
          the internet, keep SSL enabled!
        </p>
      </fieldset>
      <FormSubmit>{saved ? "Saved!" : "Update"}</FormSubmit>
    </Form>
  )
}
