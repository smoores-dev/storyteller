import { type EmissionResult } from "@storyteller-platform/ghost-story"

export type EmissionTimings = Pick<
  EmissionResult,
  "secondsPerChunk" | "secondsPerFrame" | "framesPerChunk"
>

export function framesToSeconds(
  frames: number,
  emissionTimings: EmissionTimings,
) {
  return (
    Math.floor(frames / emissionTimings.framesPerChunk) *
      emissionTimings.secondsPerChunk +
    (frames % emissionTimings.framesPerChunk) * emissionTimings.secondsPerFrame
  )
}
