export type ConversionMode = "file-first" | "streaming"

interface GhostStoryConfig {
  conversionMode: ConversionMode
  enableTiming: boolean
}

const config: GhostStoryConfig = {
  conversionMode: getConversionModeFromEnv(),
  enableTiming: true, // process.env["GHOST_STORY_TIMING"] ? process.env["GHOST_STORY_TIMING"] === "true" : true,
}

function getConversionModeFromEnv(): ConversionMode {
  const envValue = process.env["GHOST_STORY_CONVERSION_MODE"]
  if (envValue === "streaming") return "streaming"
  return "file-first"
}

export function getConfig(): GhostStoryConfig {
  return { ...config }
}

export function setConversionMode(mode: ConversionMode): void {
  config.conversionMode = mode
}

export function setTimingEnabled(enabled: boolean): void {
  config.enableTiming = enabled
}

export function getConversionMode(): ConversionMode {
  return config.conversionMode
}

export function isTimingEnabled(): boolean {
  return config.enableTiming
}
