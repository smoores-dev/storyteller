import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"

import { type PutObjectCommandInput } from "@aws-sdk/client-s3"
import {
  type GetTranscriptionJobCommandInput,
  LanguageCode,
  type StartTranscriptionJobCommandInput,
  type TranscriptionJobStatus,
} from "@aws-sdk/client-transcribe"

import {
  type AudioFormat,
  type AudioSource,
  type RawAudioInput,
  formatToExtension,
  isAudioSource,
  normalizeToAudioSource,
} from "../audio/index.ts"
import type { Timeline } from "../utilities/Timeline.ts"
import type { Timing } from "../utilities/Timing.ts"

const wordCharacterRegExp = /\p{L}|\p{N}/u

export interface AmazonTranscribeOptions {
  region: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  inputFormat?: AudioFormat | undefined
  timing?: Timing | undefined
}

export async function recognize(
  input: RawAudioInput | AudioSource,
  languageCode: string,
  timing: Timing,
  options: AmazonTranscribeOptions,
) {
  const source = isAudioSource(input)
    ? input
    : normalizeToAudioSource(input, options.inputFormat)

  const resolvedLanguageCode = resolveLanguageCode(languageCode)

  const s3Sdk = await import("@aws-sdk/client-s3")
  const transcribeSdk = await import("@aws-sdk/client-transcribe")

  const s3Client = new s3Sdk.S3Client({
    region: options.region,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  })
  const transcribeClient = new transcribeSdk.TranscribeClient({
    region: options.region,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  })

  const s3Params: PutObjectCommandInput = {
    Bucket: options.bucketName,
    Key: `${randomUUID()}${formatToExtension(source.format)}`,
    Body: await convertSourceToStreamableBody(source),
  }

  const s3Command = new s3Sdk.PutObjectCommand(s3Params)
  await timing.timeAsync("upload", async () => {
    return await s3Client.send(s3Command)
  })

  const mediaFileUri = `s3://${options.bucketName}/${s3Params.Key}`

  const transcribeParams: StartTranscriptionJobCommandInput = {
    TranscriptionJobName: randomUUID(),
    LanguageCode: resolvedLanguageCode as LanguageCode,
    Media: {
      MediaFileUri: mediaFileUri,
    },
  }

  const transcribeCommand = new transcribeSdk.StartTranscriptionJobCommand(
    transcribeParams,
  )

  await timing.timeAsync("start", async () => {
    return await transcribeClient.send(transcribeCommand)
  })

  const pollParams: GetTranscriptionJobCommandInput = {
    TranscriptionJobName: transcribeParams.TranscriptionJobName,
  }

  const pollCommand = new transcribeSdk.GetTranscriptionJobCommand(pollParams)

  const transcriptResult = await timing.timeAsync("transcribe", async () => {
    const fileUri = await new Promise<string>((resolve, reject) => {
      const interval = setInterval(async () => {
        const result = await transcribeClient.send(pollCommand)
        const status = result.TranscriptionJob?.TranscriptionJobStatus
        if (status === "QUEUED" || status === "IN_PROGRESS") return
        if (status === "COMPLETED") {
          const fileUri = result.TranscriptionJob?.Transcript?.TranscriptFileUri
          if (!fileUri) {
            reject(new Error("Unknown error"))
          } else {
            resolve(fileUri)
          }
        }
        reject(
          new Error(result.TranscriptionJob?.FailureReason ?? "Unknown error"),
        )
        clearInterval(interval)
      }, 1000)
    })

    const response = await fetch(fileUri)
    return (await response.json()) as TranscriptResult
  })

  await s3Client.send(
    new s3Sdk.DeleteObjectCommand({
      Bucket: s3Params.Bucket,
      Key: s3Params.Key,
    }),
  )

  const transcript = transcriptResult.results.transcripts[0].transcript
    .replace(/ +/g, " ")
    .trim()

  const timeline: Timeline = []
  for (const item of transcriptResult.results.items) {
    const lastEntry = timeline.at(-1)

    if (item.type === "punctuation") {
      if (!lastEntry) continue
      const content = item.alternatives[0].content
      lastEntry.text += content
      continue
    }

    const text = item.alternatives[0].content
    if (!text || !wordCharacterRegExp.test(text)) continue

    const startTime = parseFloat(item.start_time)
    const endTime = parseFloat(item.end_time)
    const confidence = parseFloat(item.alternatives[0].confidence)

    if (lastEntry) {
      lastEntry.endTime = startTime
    }

    timeline.push({
      type: "word",
      text,
      startTime,
      endTime,
      confidence,
    })
  }

  return { transcript, timeline }
}

async function convertSourceToStreamableBody(
  source: AudioSource,
): Promise<NonNullable<PutObjectCommandInput["Body"]>> {
  if (source.type === "file") {
    return await readFile(source.path)
  }

  if (source.type === "stream") {
    return source.stream
  }

  return source.buffer
}

function resolveLanguageCode(languageCode: string): string {
  if (
    Object.values(LanguageCode).includes(
      languageCode as (typeof LanguageCode)[keyof typeof LanguageCode],
    )
  ) {
    return languageCode
  }

  if (languageCode.length === 2) {
    const matchingDialect = languageCodeDefaultDialects.find((value) =>
      value.startsWith(languageCode),
    )
    if (matchingDialect) {
      return matchingDialect
    }
  }

  throw new Error(
    `Language code ${languageCode} is not supported by Amazon Transcribe`,
  )
}

export const languageCodeDefaultDialects: string[] = [
  "af-ZA",
  "ar-SA",
  "ca-ES",
  "cs-CZ",
  "da-DK",
  "de-DE",
  "el-GR",
  "en-US",
  "es-ES",
  "eu-ES",
  "fa-IR",
  "fi-FI",
  "fr-FR",
  "gl-ES",
  "he-IL",
  "hi-IN",
  "hr-HR",
  "id-ID",
  "it-IT",
  "ja-JP",
  "ko-KR",
  "lv-LV",
  "ms-MY",
  "nl-NL",
  "no-NO",
  "pl-PL",
  "pt-BR",
  "ro-RO",
  "ru-RU",
  "sk-SK",
  "so-SO",
  "sr-RS",
  "sv-SE",
  "th-TH",
  "tl-PH",
  "uk-UA",
  "vi-VN",
  "zh-CN",
]

interface TranscriptResultTranscript {
  transcript: string
}

interface TranscriptResultItemAlternative {
  confidence: string
  content: string
}

interface TranscriptResultPronunciationItem {
  id: number
  type: "pronunciation"
  alternatives: [
    TranscriptResultItemAlternative,
    ...TranscriptResultItemAlternative[],
  ]
  start_time: string
  end_time: string
}

interface TranscriptResultPunctuationItem {
  id: number
  type: "punctuation"
  alternatives: [
    TranscriptResultItemAlternative,
    ...TranscriptResultItemAlternative[],
  ]
}

type TranscriptResultItem =
  | TranscriptResultPronunciationItem
  | TranscriptResultPunctuationItem

interface TranscriptResult {
  jobName: string
  accountId: string
  status: TranscriptionJobStatus
  results: {
    transcripts: [TranscriptResultTranscript, ...TranscriptResultTranscript[]]
    items: TranscriptResultItem[]
  }
}
