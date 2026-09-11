export const WHISPER_CPP_UPSTREAM_VERSION = "1.8.3"
export const WHISPER_CPP_PATCH_LEVEL = 2
export const WHISPER_CPP_VERSION = `${WHISPER_CPP_UPSTREAM_VERSION}-st.${WHISPER_CPP_PATCH_LEVEL}`
export const WHISPER_MODEL_VERSION = "1.0.0"
export const SILERO_VAD_VERSION = "6.2.0"

export const BUILD_VARIANTS = [
  "darwin-arm64-coreml",
  "darwin-arm64-cpu",
  "darwin-x64-cpu",
  "linux-x64-blas",
  "linux-x64-cpu",
  "linux-x64-cuda-13.1.0",
  "linux-x64-cuda-12.9.0",
  "linux-x64-cuda-11.8.0",
  "linux-x64-sycl",
  "linux-x64-vulkan",
  "linux-x64-rocm",
  "linux-x64-cuda-13.1.0-legacy",
  "linux-x64-cuda-12.9.0-legacy",
  "linux-x64-cuda-11.8.0-legacy",
  "linux-x64-sycl-legacy",
  "linux-x64-vulkan-legacy",
  "linux-x64-rocm-legacy",
  "linux-x64-blas-legacy",
  "linux-x64-cpu-legacy",
  "linux-arm64-cpu",
  "windows-x64-cpu",
  "windows-x64-cuda-13.1.0",
  "windows-x64-cuda-12.9.0",
  "windows-x64-cuda-11.8.0",
  "windows-x64-vulkan",
] as const

export type BuildVariant = (typeof BUILD_VARIANTS)[number]

export type Platform = "darwin" | "linux" | "win32"
export type Arch = "arm64" | "x64"

export const WHISPER_MODELS = [
  "tiny",
  "tiny.en",
  "tiny-q5_1",
  "tiny.en-q5_1",
  "tiny-q8_0",
  "base",
  "base.en",
  "base-q5_1",
  "base.en-q5_1",
  "base-q8_0",
  "small",
  "small.en",
  "small-q5_1",
  "small.en-q5_1",
  "small-q8_0",
  "medium",
  "medium.en",
  "medium-q5_0",
  "medium.en-q5_0",
  "medium-q8_0",
  "large-v1",
  "large-v2",
  "large-v2-q5_0",
  "large-v2-q8_0",
  "large-v3",
  "large-v3-q5_0",
  "large-v3-turbo",
  "large-v3-turbo-q5_0",
  "large-v3-turbo-q8_0",
] as const
export type WhisperModel = (typeof WHISPER_MODELS)[number]

export const WAV2VEC2_DEVICES = [
  "auto",
  "cpu",
  "webgpu",
  "cuda",
  "mlx",
] as const
export type Wav2Vec2Device = (typeof WAV2VEC2_DEVICES)[number]

export const WAV2VEC2_SECONDS_PER_CHUNK = 25

export const WAV2VEC2_DTYPES = ["fp32", "fp16"] as const
export type Wav2Vec2DataType = (typeof WAV2VEC2_DTYPES)[number]

export const ALIGNERS = ["whisper", "ctc"] as const
export type Aligner = (typeof ALIGNERS)[number]

export const WAV2VEC_ENGINES = [
  "wav2vec-local",
  // "wav2vec-server",
] as const
export type Wav2VecEngine = (typeof WAV2VEC_ENGINES)[number]
export const CTC_MODEL_VERSION = "1.0.0"

export const CTC_MODELS = [
  "fp32",
  "fp16",
  "mlx",
  "quartznet15x5_ar",
  "quartznet15x5_ca",
  "quartznet15x5_de",
  "quartznet15x5_en",
  "quartznet15x5_es",
  "quartznet15x5_fo",
  "quartznet15x5_fr",
  "quartznet15x5_hy",
  "quartznet15x5_is",
  "quartznet15x5_it",
  "quartznet15x5_kk",
  "quartznet15x5_mt",
  "quartznet15x5_pl",
  "quartznet15x5_pt",
  "quartznet15x5_ru",
  "quartznet15x5_zh",
] as const
export type CtcModel = (typeof CTC_MODELS)[number]

export type CtcModelPackage = {
  name: string
  version: string
  /** id of the package in the gitlab package registry */
  packageId: number
  /** id of the model version, which is what the download endpoint takes */
  modelVersionId: number
  /** where the files land, relative to the model directory */
  subdir: string
  /** file that has to exist for the package to count as installed */
  entryFile: string
}

/**
 * ctc aligner weights in the gitlab model registry.
 * `subdir` has to match what the loaders expect: transformers.js caches under
 * the huggingface repo id, the mlx loader takes a plain directory.
 */
export const CTC_MODEL_PACKAGES: Record<CtcModel, CtcModelPackage> = {
  fp32: {
    name: "mms-300m-1130-forced-aligner-ONNX",
    version: CTC_MODEL_VERSION,
    packageId: 68949503,
    modelVersionId: 3023068,
    subdir: "onnx-community/mms-300m-1130-forced-aligner-ONNX",
    entryFile: "onnx/model.onnx",
  },
  fp16: {
    name: "mms-300m-1130-forced-aligner-ONNX-fp16",
    version: CTC_MODEL_VERSION,
    packageId: 68959176,
    modelVersionId: 3023070,
    subdir: "onnx-community/mms-300m-1130-forced-aligner-ONNX",
    entryFile: "onnx/model_fp16.onnx",
  },
  mlx: {
    name: "mms-300m-1130-forced-aligner-fp16",
    version: CTC_MODEL_VERSION,
    packageId: 68943298,
    modelVersionId: 3023067,
    subdir: "mms-300m-1130-forced-aligner-fp16",
    entryFile: "model.safetensors",
  },
  quartznet15x5_ar: {
    name: "quartznet15x5-ar",
    version: CTC_MODEL_VERSION,
    packageId: 69179463,
    modelVersionId: 3023114,
    subdir: "quartznet15x5-ar",
    entryFile: "model.safetensors",
  },
  quartznet15x5_ca: {
    name: "quartznet15x5-ca",
    version: CTC_MODEL_VERSION,
    packageId: 69179413,
    modelVersionId: 3023106,
    subdir: "quartznet15x5-ca",
    entryFile: "model.safetensors",
  },
  quartznet15x5_de: {
    name: "quartznet15x5-de",
    version: CTC_MODEL_VERSION,
    packageId: 69179391,
    modelVersionId: 3023101,
    subdir: "quartznet15x5-de",
    entryFile: "model.safetensors",
  },
  quartznet15x5_en: {
    name: "quartznet15x5-en",
    version: CTC_MODEL_VERSION,
    packageId: 69178877,
    modelVersionId: 3023100,
    subdir: "quartznet15x5-en",
    entryFile: "model.safetensors",
  },
  quartznet15x5_es: {
    name: "quartznet15x5-es",
    version: CTC_MODEL_VERSION,
    packageId: 69179396,
    modelVersionId: 3023102,
    subdir: "quartznet15x5-es",
    entryFile: "model.safetensors",
  },
  quartznet15x5_fo: {
    name: "quartznet15x5-fo",
    version: CTC_MODEL_VERSION,
    packageId: 69179429,
    modelVersionId: 3023110,
    subdir: "quartznet15x5-fo",
    entryFile: "model.safetensors",
  },
  quartznet15x5_fr: {
    name: "quartznet15x5-fr",
    version: CTC_MODEL_VERSION,
    packageId: 69179401,
    modelVersionId: 3023103,
    subdir: "quartznet15x5-fr",
    entryFile: "model.safetensors",
  },
  quartznet15x5_hy: {
    name: "quartznet15x5-hy",
    version: CTC_MODEL_VERSION,
    packageId: 69179453,
    modelVersionId: 3023112,
    subdir: "quartznet15x5-hy",
    entryFile: "model.safetensors",
  },
  quartznet15x5_is: {
    name: "quartznet15x5-is",
    version: CTC_MODEL_VERSION,
    packageId: 69179426,
    modelVersionId: 3023109,
    subdir: "quartznet15x5-is",
    entryFile: "model.safetensors",
  },
  quartznet15x5_it: {
    name: "quartznet15x5-it",
    version: CTC_MODEL_VERSION,
    packageId: 69179406,
    modelVersionId: 3023104,
    subdir: "quartznet15x5-it",
    entryFile: "model.safetensors",
  },
  quartznet15x5_kk: {
    name: "quartznet15x5-kk",
    version: CTC_MODEL_VERSION,
    packageId: 69179458,
    modelVersionId: 3023113,
    subdir: "quartznet15x5-kk",
    entryFile: "model.safetensors",
  },
  quartznet15x5_mt: {
    name: "quartznet15x5-mt",
    version: CTC_MODEL_VERSION,
    packageId: 69179444,
    modelVersionId: 3023111,
    subdir: "quartznet15x5-mt",
    entryFile: "model.safetensors",
  },
  quartznet15x5_pl: {
    name: "quartznet15x5-pl",
    version: CTC_MODEL_VERSION,
    packageId: 69179410,
    modelVersionId: 3023105,
    subdir: "quartznet15x5-pl",
    entryFile: "model.safetensors",
  },
  quartznet15x5_pt: {
    name: "quartznet15x5-pt",
    version: CTC_MODEL_VERSION,
    packageId: 69179421,
    modelVersionId: 3023108,
    subdir: "quartznet15x5-pt",
    entryFile: "model.safetensors",
  },
  quartznet15x5_ru: {
    name: "quartznet15x5-ru",
    version: CTC_MODEL_VERSION,
    packageId: 69179418,
    modelVersionId: 3023107,
    subdir: "quartznet15x5-ru",
    entryFile: "model.safetensors",
  },
  quartznet15x5_zh: {
    name: "quartznet15x5-zh",
    version: CTC_MODEL_VERSION,
    packageId: 69180064,
    modelVersionId: 3023115,
    subdir: "quartznet15x5-zh",
    entryFile: "model.safetensors",
  },
}

export const RECOGNITION_ENGINES = [
  "whisper.cpp",
  "whisper-server",
  "google-cloud",
  "microsoft-azure",
  "amazon-transcribe",
  "openai-cloud",
  "deepgram",
] as const
export type RecognitionEngine = (typeof RECOGNITION_ENGINES)[number]

export const MODEL_SIZES: Record<WhisperModel | "silero-vad", number> = {
  tiny: 77691713,
  "tiny-q5_1": 32152673,
  "tiny.en": 77704715,
  "tiny.en-q5_1": 32166155,
  "tiny-q8_0": 43537433,
  base: 147951465,
  "base.en": 147964211,
  "base-q5_1": 59707625,
  "base.en-q5_1": 59721011,
  "base-q8_0": 81768585,
  small: 487601967,
  "small.en": 487614201,
  "small-q5_1": 190085487,
  "small.en-q5_1": 190098681,
  "small-q8_0": 264464607,
  medium: 1533763059,
  "medium.en": 1533774781,
  "medium-q5_0": 539212467,
  "medium.en-q5_0": 539225533,
  "medium-q8_0": 823369779,
  "large-v1": 3094623691,
  "large-v2": 3094623691,
  "large-v2-q5_0": 1080732091,
  "large-v2-q8_0": 1656129691,
  "large-v3": 3095033483,
  "large-v3-q5_0": 1081140203,
  "large-v3-turbo": 1624555275,
  "large-v3-turbo-q5_0": 574041195,
  "large-v3-turbo-q8_0": 874188075,
  "silero-vad": 884595,
}

// prettier-ignore
export const LANGUAGES = [ "af", "am", "ar", "as", "az", "ba", "be", "bg", "bn", "bo", "br", "bs", "ca", "cs", "cy", "da", "de", "el", "en", "es", "et", "eu", "fa", "fi", "fo", "fr", "gl", "gu", "ha", "haw", "he", "hi", "hr", "ht", "hu", "hy", "id", "is", "it", "ja", "jw", "ka", "kk", "km", "kn", "ko", "la", "lb", "ln", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "ne", "nl", "nn", "no", "oc", "pa", "pl", "ps", "pt", "ro", "ru", "sa", "sd", "si", "sk", "sl", "sn", "so", "sq", "sr", "su", "sv", "sw", "ta", "te", "tg", "th", "tk", "tl", "tr", "tt", "uk", "ur", "uz", "vi", "yi", "yo", "zh",
] as const

export type Language = (typeof LANGUAGES)[number]
