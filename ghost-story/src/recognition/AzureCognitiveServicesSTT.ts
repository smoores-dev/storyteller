import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk"

import {
  type AudioFormat,
  type AudioSource,
  type RawAudioInput,
  isAudioSource,
  normalizeToAudioSource,
  prepareWavForService,
  toReadStream,
} from "../audio/index.ts"
import type { Timeline } from "../utilities/Timeline.ts"
import type { Timing } from "../utilities/Timing.ts"

export interface AzureSTTOptions {
  subscriptionKey: string
  serviceRegion: string
  profanity?: SpeechSDK.ProfanityOption | undefined
  inputFormat?: AudioFormat | undefined
  timing?: Timing | undefined
}

export async function recognize(
  input: RawAudioInput | AudioSource,
  languageCode: string,
  timing: Timing,
  options: AzureSTTOptions,
) {
  const source = isAudioSource(input)
    ? input
    : normalizeToAudioSource(input, options.inputFormat)

  const conversionNeeded = source.format !== "wav"
  timing.setMetadata("conversionRequired", conversionNeeded)
  timing.setMetadata("targetFormat", "wav")

  const doPrepare = () =>
    prepareWavForService(source, { sampleRate: 16000, channels: 1 })

  const prepared = await timing.timeAsync("conversion", doPrepare)

  try {
    const doRecognition = () =>
      runRecognition(
        prepared.source,
        options.subscriptionKey,
        options.serviceRegion,
        languageCode,
        options.profanity ?? SpeechSDK.ProfanityOption.Raw,
      )

    const result = await timing.timeAsync("upload", doRecognition)

    const transcript = result.text
    const resultObject = JSON.parse(result.json) as {
      NBest: { Words: { Word: string; Offset: number; Duration: number }[] }[]
    }
    const bestResult = resultObject.NBest[0]

    const timeline: Timeline = []
    for (const wordEntry of bestResult?.Words ?? []) {
      const text = wordEntry.Word
      const startTime = wordEntry.Offset / 10000000
      const endTime = (wordEntry.Offset + wordEntry.Duration) / 10000000
      timeline.push({ type: "word", text, startTime, endTime })
    }

    return { transcript, timeline }
  } finally {
    await prepared.cleanup()
  }
}

async function runRecognition(
  source: AudioSource,
  subscriptionKey: string,
  serviceRegion: string,
  languageCode: string,
  profanity: SpeechSDK.ProfanityOption,
): Promise<SpeechSDK.SpeechRecognitionResult> {
  const audioFormat = SpeechSDK.AudioStreamFormat.getWaveFormat(
    16000,
    16,
    1,
    SpeechSDK.AudioFormatTag.PCM,
  )

  const pushStream = SpeechSDK.AudioInputStream.createPushStream(audioFormat)

  const readable = toReadStream(source)

  const streamPromise = new Promise<void>((resolve, reject) => {
    readable
      .on("data", (chunk: Buffer) => {
        const arrayBuffer = new ArrayBuffer(chunk.length)
        const view = new Uint8Array(arrayBuffer)
        chunk.copy(view)
        pushStream.write(arrayBuffer)
      })
      .on("end", () => {
        pushStream.close()
        resolve()
      })
      .on("error", (err: Error) => {
        pushStream.close()
        reject(err)
      })
  })

  const recognitionPromise = new Promise<SpeechSDK.SpeechRecognitionResult>(
    (resolve, reject) => {
      const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream)
      const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
        subscriptionKey,
        serviceRegion,
      )

      speechConfig.speechRecognitionLanguage = languageCode
      speechConfig.setProfanity(profanity)
      speechConfig.requestWordLevelTimestamps()
      speechConfig.outputFormat = SpeechSDK.OutputFormat.Detailed

      const recognizer = new SpeechSDK.SpeechRecognizer(
        speechConfig,
        audioConfig,
      )

      recognizer.recognizeOnceAsync(
        (result) => {
          recognizer.close()
          resolve(result)
        },
        (error) => {
          recognizer.close()
          reject(new Error(error))
        },
      )
    },
  )

  await streamPromise
  return recognitionPromise
}
