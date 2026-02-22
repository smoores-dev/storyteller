import { extendDeep } from "../utilities/ObjectUtilities.ts"
import type { StreamOptions } from "../vad/ActiveGate.ts"
import { type AdaptiveGateVADOptions } from "../vad/ActiveGateOg.ts"
import type { SileroOptions } from "../vad/Silero.ts"

export interface VadSegment {
  startTime: number
  endTime: number
  isSpeech: boolean
}

export type VoiceActivityDetectionOptions =
  | {
      engine: "silero"
      silero?: SileroOptions
    }
  | {
      engine: "active-gate"
      activeGate?: StreamOptions
    }
  | {
      engine: "active-gate-og"
      activeGateOg?: AdaptiveGateVADOptions
    }

const defaultVoiceActivityDetectionOptions: VoiceActivityDetectionOptions = {
  engine: "active-gate-og",
}

export async function detectVoiceActivity(
  inputPath: string,
  options: VoiceActivityDetectionOptions = defaultVoiceActivityDetectionOptions,
): Promise<VadSegment[]> {
  const opts = extendDeep(defaultVoiceActivityDetectionOptions, options)

  switch (opts.engine) {
    case "silero": {
      const SileroVAD = await import("../vad/Silero.ts")
      const sileroOpts = "silero" in opts ? opts.silero : undefined
      return SileroVAD.detectVoiceActivity(inputPath, sileroOpts)
    }
    case "active-gate-og": {
      const ActiveGateOgVAD = await import("../vad/ActiveGateOg.ts")
      const activeGateOgOpts =
        "activeGateOg" in opts ? opts.activeGateOg : undefined
      const timeline = await ActiveGateOgVAD.detectVoiceActivity(
        inputPath,
        activeGateOgOpts,
      )

      return timeline.map((seg) => ({
        startTime: seg.startTime,
        endTime: seg.endTime,
        isSpeech: seg.type === "segment" && seg.text === "active",
      }))
    }
    case "active-gate": {
      const ActiveGateVAD = await import("../vad/ActiveGate.ts")
      const activeGateOpts = "activeGate" in opts ? opts.activeGate : undefined
      const segments = await ActiveGateVAD.vadFromFile(
        inputPath,
        activeGateOpts,
      )
      return segments.map((seg) => ({
        startTime: seg.startTime,
        endTime: seg.endTime,
        isSpeech: seg.isActive,
      }))
    }
  }
}
