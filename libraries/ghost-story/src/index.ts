export {
  type AudioInput,
  type RecognitionOptions,
  type RecognitionResult,
  recognitionEngines,
  recognize,
} from "./api/Recognition.ts"
export {
  type EmissionOptions,
  type EmissionResult,
  emit,
} from "./api/Emission.ts"
export {
  type AudioFormat,
  type AudioFormatInfo,
  type AudioSource,
  type AudioSourceFromBuffer,
  type AudioSourceFromFile,
  type AudioSourceFromStream,
  type ConversionOptions,
  type PreparedAudio,
  type RawAudioInput,
  type ServiceCapabilities,
  audioSourceFromBuffer,
  audioSourceFromFile,
  audioSourceFromStream,
  convertToBuffer,
  convertToFile,
  createStreamingConversion,
  formatFromExtension,
  formatToExtension,
  getFormat,
  getFormatInfo,
  getTargetFormat,
  isAudioSource,
  needsConversion,
  normalizeToAudioSource,
  prepareForService,
  prepareWavForService,
  serviceCapabilities,
  toBuffer,
  toFilePath,
  toReadStream,
} from "./audio/index.ts"
export {
  applyLegacyCpuFallback,
  detectPlatform,
  getConfiguredVariant,
  getInstallDir,
  getInstalledVariant,
  getModelDir,
  getModelPath,
  getVadModelPath,
  getWhisperExecutablePath,
  getWhisperServerExecutablePath,
  isValidModel,
  resolveVariant,
  resolveWav2Vec2Device,
  resolveWav2Vec2Dtype,
} from "./cli/config.ts"
export {
  type InstallBinaryOptions,
  type InstallModelOptions,
  type InstallVadModelOptions,
  type InstallWav2Vec2ModelOptions,
  ensureWhisperInstalled,
  installBinary,
  installModel,
  installVadModel,
  installWav2Vec2Model,
} from "./cli/install.ts"
export {
  type EmissionWireResult,
  decodeEmissions,
  encodeEmissions,
} from "./emission/EmissionWire.ts"
export {
  type LoadWav2Vec2ModelOptions,
  type Wav2Vec2ModelBundle,
  type Wav2Vec2Options,
  type Wav2Vec2Result,
  loadWav2Vec2Model,
} from "./emission/Wav2Vec2Emission.ts"
export { type Wav2Vec2ServerOptions } from "./emission/Wav2Vec2ServerEmission.ts"
export {
  type ConversionMode,
  getConfig,
  getConversionMode,
  isTimingEnabled,
  setConversionMode,
  setTimingEnabled,
} from "./config.ts"
export {
  type OpenAICloudSTTOptions,
  type RecognitionResult as OpenAIResult,
  inputPreference as openaiInputPreference,
  recognize as recognizeOpenAI,
} from "./recognition/OpenAICloudSTT.ts"
export {
  type RecognitionResult as WhisperCppResult,
  type WhisperCppModelId,
  type WhisperCppOptions,
  inputPreference as whisperCppInputPreference,
  recognize as recognizeWhisperCpp,
} from "./recognition/WhisperCppSTT.ts"
export {
  type RecognitionResult as WhisperServerResult,
  type WhisperServerOptions,
  inputPreference as whisperServerInputPreference,
  recognize as recognizeWhisperServer,
} from "./recognition/WhisperServerSTT.ts"
export type {
  Timeline,
  TimelineEntry,
  TimelineEntryType,
} from "./utilities/Timeline.ts"
export {
  spacelessScriptPattern,
  spacelessScripts,
  startsWithSpacelessScript,
} from "./utilities/SpacelessScripts.ts"
export {
  type AggregatedStats,
  type PhaseTiming,
  Timing,
  TimingAggregator,
  type TimingSpan,
  type TimingSummary,
  createAggregator,
  createTiming,
  formatDuration,
  formatPercentage,
  formatSingleReport,
  printSingleReport,
} from "./utilities/Timing.ts"
export {
  type SileroOptions,
  type VadSegment,
  detectVoiceActivity,
  ensureVadInstalled,
  segmentsToTimeline,
} from "./vad/Silero.ts"

// export * from "./constants.ts"
