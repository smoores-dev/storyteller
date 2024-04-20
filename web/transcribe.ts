import { JsObject } from "pymport"
import nodecallspython from "node-calls-python"
import { TranscriptionResult as WhisperXTranscriptionResult } from "./synchronize/whisperx"
import { cwd } from "process"

const py = nodecallspython.interpreter

py.addImportPath("/home/node/.local/venv")
py.addImportPath(cwd())

const whisperx = py.importSync("transcribe", false)

export type TranscriptionResult = JsObject<WhisperXTranscriptionResult>

export async function transcribeTrack(
  trackPath: string,
  device: string,
  computeType: string,
  batchSize: number,
  initialPrompt: string,
): Promise<TranscriptionResult> {
  console.log(`Transcribing audio file ${trackPath}`)

  const transcription = await py.call(
    whisperx,
    "transcribe",
    trackPath,
    device,
    computeType,
    batchSize,
    initialPrompt,
  )

  return transcription as TranscriptionResult
}
