import { TranscriptionResult as WhisperXTranscriptionResult } from "./synchronize/whisperx"
import { promisify } from "node:util"
import { exec as execCallback } from "node:child_process"
import { JsObject } from "pymport"

const exec = promisify(execCallback)

export type TranscriptionResult = JsObject<WhisperXTranscriptionResult>

export async function transcribeTrack(
  trackPath: string,
  initialPrompt: string,
  device: string,
  computeType: string,
  batchSize: number,
): Promise<TranscriptionResult> {
  console.log(`Transcribing audio file ${trackPath}`)

  const { stdout } = await exec(
    `python3 transcribe.py "${trackPath.replaceAll(/"/g, '\\"')}" "${device}" "${computeType}" "${batchSize}" "${initialPrompt.replaceAll(/"/g, '\\"')}"`,
  )

  const result = stdout
    .split("\n")
    .find((line) => line.startsWith("ST_RESULT:"))
    ?.replace("ST_RESULT:", "")

  if (!result) {
    throw new Error(
      `Failed to parse transcription result for track ${trackPath}`,
    )
  }

  return JSON.parse(result) as TranscriptionResult
}
