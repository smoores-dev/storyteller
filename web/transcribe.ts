import { JsObject, pymport } from "pymport"
import {
  TranscribeModel,
  WhisperX,
  TranscriptionResult as WhisperXTranscriptionResult,
} from "./synchronize/whisperx"

const whisperx = pymport("whisperx") as WhisperX

export function getTranscribeModel(
  device: string,
  computeType: string,
  initialPrompt: string,
) {
  return whisperx.get("load_model").call("base.en", {
    device,
    compute_type: computeType,
    asr_options: { word_timestamps: true, initial_prompt: initialPrompt },
  })
}

export function getAlignModel(device: string) {
  const result = whisperx
    .get("load_align_model")
    .call({ language_code: "en", device })
  return { alignModel: result.item(0), alignMetadata: result.item(1) }
}

export type TranscriptionResult = JsObject<WhisperXTranscriptionResult>

export function transcribeTrack(
  trackPath: string,
  device: string,
  transcribeModel: TranscribeModel,
  alignModel: unknown,
  alignMetadata: unknown,
  batchSize: number,
): TranscriptionResult {
  console.log(`Transcribing audio file ${trackPath}`)

  console.log("Loading audio")
  const audio = whisperx.get("load_audio").call(trackPath)

  console.log("Transcribing audio")
  const unaligned = transcribeModel
    .get("transcribe")
    .call(audio, { batch_size: batchSize })

  console.log("Aligning transcription")
  const transcription = whisperx
    .get("align")
    .call(unaligned.item("segments"), alignModel, alignMetadata, audio, {
      device,
      return_char_alignments: false,
    })

  return transcription.toJS()
}
