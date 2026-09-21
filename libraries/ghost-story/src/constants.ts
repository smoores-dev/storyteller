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

export const CTC_DEVICES = ["auto", "cpu", "webgpu", "cuda", "mlx"] as const
export type CtcDevice = (typeof CTC_DEVICES)[number]
export type ResolvedCtcDevice = Exclude<CtcDevice, "auto">

export const DEFAULT_CTC_BATCH_SIZE = 2

export const CTC_DTYPES = ["fp32", "fp16"] as const
export type CtcDataType = (typeof CTC_DTYPES)[number]

export const ALIGNERS = ["whisper", "ctc"] as const
export type Aligner = (typeof ALIGNERS)[number]

export const CTC_ENGINES = [
  "ctc-local",
  // "ctc-server",
] as const
export type CtcEngine = (typeof CTC_ENGINES)[number]
export const CTC_MODEL_VERSION = "1.0.0"

export const CTC_MODEL_VARIANTS = [
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
  "quartznet15x5_ja",
  "citrinet256_en",
  "citrinet512_ca",
  "citrinet512_de",
  "citrinet512_en",
  "citrinet512_es",
  "citrinet512_fr",
  "citrinet512_hy",
  "citrinet512_it",
  "citrinet512_nl",
  "citrinet512_pt",
  "citrinet512_uk",
  "citrinet512_zh",
  "citrinet1024_en",
  "citrinet1024_ko",
  "citrinet1024_uk",
  "citrinet1024_zh",
] as const
export type CtcModelVariant = (typeof CTC_MODEL_VARIANTS)[number]

export function isCtcModelVariant(variant: string): variant is CtcModelVariant {
  return CTC_MODEL_VARIANTS.includes(variant as CtcModelVariant)
}

/**
 * The pipeline a model runs through. wav2vec2 takes the raw waveform through
 * the transformers.js feature extractor and a transformer encoder, the two
 * convolutional architectures take mel features through an ONNX or MLX graph.
 */
export const CTC_ARCHITECTURES = ["wav2vec2", "quartznet", "citrinet"] as const
export type CtcArchitecture = (typeof CTC_ARCHITECTURES)[number]

/**
 * How a model's vocabulary maps onto text. Character models emit one letter
 * per class with `|` as the word boundary, sentencepiece models emit unigram
 * pieces read from the package's tokenizer.spm.
 */
export const CTC_TOKENIZERS = ["characters", "sentencepiece"] as const
export type CtcTokenizer = (typeof CTC_TOKENIZERS)[number]

export const CTC_MODEL_FAMILIES = [
  "mms",
  "quartznet15x5",
  "citrinet256",
  "citrinet512",
  "citrinet1024",
] as const
export type CtcModelFamily = (typeof CTC_MODEL_FAMILIES)[number]

export interface CtcModelFamilyInfo {
  architecture: CtcArchitecture
  tokenizer: CtcTokenizer
  /** How much audio goes through the model per call. */
  chunkSeconds: number
  /**
   * Seconds from a word's first character spike back to where the word
   * starts in the audio, and from its last character spike to where it ends.
   * Measured on the TIMIT test set (11025 hand labelled words) as the median
   * spike position against the labels. MMS spikes sit just inside the word,
   * QuartzNet fires late and bunches its characters mid word, Citrinet fires
   * early. The aligner adds these to the spike frames before it clamps a
   * boundary against its neighbours.
   */
  startOffsetSeconds: number
  endOffsetSeconds: number
}

/**
 * QuartzNet on MLX pads every depthwise convolution up to the next power of
 * two before its FFT, so throughput is a staircase in the chunk length: 20 to
 * 39 seconds all cost the same, and 38 seconds carries the most audio for it.
 */
export const CTC_MODEL_FAMILY_INFO: Record<CtcModelFamily, CtcModelFamilyInfo> =
  {
    mms: {
      architecture: "wav2vec2",
      tokenizer: "characters",
      chunkSeconds: 25,
      startOffsetSeconds: -0.04,
      endOffsetSeconds: 0.04,
    },
    quartznet15x5: {
      architecture: "quartznet",
      tokenizer: "characters",
      chunkSeconds: 38,
      startOffsetSeconds: -0.28,
      endOffsetSeconds: -0.12,
    },
    citrinet256: {
      architecture: "citrinet",
      tokenizer: "sentencepiece",
      chunkSeconds: 25,
      startOffsetSeconds: 0.03,
      endOffsetSeconds: 0.2,
    },
    citrinet512: {
      architecture: "citrinet",
      tokenizer: "sentencepiece",
      chunkSeconds: 25,
      startOffsetSeconds: 0.03,
      endOffsetSeconds: 0.2,
    },
    citrinet1024: {
      architecture: "citrinet",
      tokenizer: "sentencepiece",
      chunkSeconds: 25,
      startOffsetSeconds: 0.03,
      endOffsetSeconds: 0.2,
    },
  }

export function isCtcModelFamily(family: string): family is CtcModelFamily {
  return CTC_MODEL_FAMILIES.includes(family as CtcModelFamily)
}

export function ctcModelLanguages(family: CtcModelFamily): Language[] {
  if (family === "mms") return [...LANGUAGES]
  return LANGUAGES.filter((language) =>
    isCtcModelVariant(`${family}_${language}`),
  )
}

export interface CtcDeviceCapabilities {
  available: ResolvedCtcDevice[]
  default: ResolvedCtcDevice
}

const CTC_DEVICE_ORDER = ["cuda", "mlx", "webgpu", "cpu"] as const

export function ctcDeviceCapabilities(
  variant: string | null | undefined,
): CtcDeviceCapabilities {
  const variantName = variant ?? ""
  const cpuVariant = variantName.includes("cpu") || variantName.includes("blas")
  const cuda = process.platform === "linux" && process.arch === "x64"
  const mlx = process.platform === "darwin" && process.arch === "arm64"
  const webgpu =
    !(process.platform === "linux" && process.arch === "arm64") && !cpuVariant

  const available = CTC_DEVICE_ORDER.filter(
    (device) =>
      device === "cpu" ||
      (device === "cuda" && cuda) ||
      (device === "mlx" && mlx) ||
      (device === "webgpu" && webgpu),
  )

  const gpuVariant =
    variantName.includes("cuda") ||
    variantName.includes("rocm") ||
    variantName.includes("sycl") ||
    variantName.includes("vulkan") ||
    variantName.includes("coreml")

  const preferred: ResolvedCtcDevice =
    cuda && variantName.includes("cuda") && !variantName.includes("cuda-11")
      ? "cuda"
      : mlx
        ? "mlx"
        : gpuVariant && webgpu
          ? "webgpu"
          : "cpu"

  return {
    available: [preferred, ...available.filter((d) => d !== preferred)],
    default: preferred,
  }
}

export function resolveCtcDevice(
  requested: CtcDevice | null | undefined,
  variant: string | null | undefined,
): ResolvedCtcDevice {
  const capabilities = ctcDeviceCapabilities(variant)
  if (
    requested &&
    requested !== "auto" &&
    capabilities.available.includes(requested)
  ) {
    return requested
  }
  return capabilities.default
}

/**
 * The precision a model actually runs in. CPU always runs float32, an explicit
 * request wins on any GPU, and left to itself every family takes half precision
 * on a GPU.
 */
export function resolveCtcDtype(
  _family: CtcModelFamily,
  device: ResolvedCtcDevice,
  requested: CtcDataType | null | undefined,
): CtcDataType {
  if (device === "cpu") return "fp32"
  return requested ?? "fp16"
}

/**
 * How many chunks go through the model per call when the caller has no
 * preference. Batching amortises GPU dispatch and is a clear win there, while
 * on a CPU the larger tensors only fall out of cache and slow the run down.
 */
export function resolveCtcBatchSize(
  device: ResolvedCtcDevice,
  requested: number | null | undefined,
): number {
  if (requested) return Math.max(1, Math.floor(requested))
  return device === "cpu" ? 1 : DEFAULT_CTC_BATCH_SIZE
}

export function resolveCtcModelVariant(
  family: CtcModelFamily,
  language: string | null | undefined,
  device: ResolvedCtcDevice,
  dtype?: CtcDataType | null,
): CtcModelVariant {
  if (family === "mms") {
    if (device === "mlx") return "mlx"
    return resolveCtcDtype(family, device, dtype)
  }
  if (!language) {
    throw new Error(
      `${family} needs a language, it handles ${ctcModelLanguages(family).join(", ")}`,
    )
  }
  const variant = `${family}_${language}`
  if (!isCtcModelVariant(variant)) {
    throw new Error(
      `${family} has no ${language} model, it handles ${ctcModelLanguages(family).join(", ")}`,
    )
  }
  return variant
}

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
  /** Spike to boundary offsets when this checkpoint differs from its family */
  startOffsetSeconds?: number
  endOffsetSeconds?: number
}

/**
 * ctc aligner weights in the gitlab model registry.
 * `subdir` has to match what the loaders expect: transformers.js caches under
 * the huggingface repo id, the mlx loader takes a plain directory.
 */
export const CTC_MODEL_PACKAGES: Record<CtcModelVariant, CtcModelPackage> = {
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
    // TODO: requires additional finetuning
    startOffsetSeconds: 0,
    endOffsetSeconds: 0,
  },
  quartznet15x5_ja: {
    name: "quartznet15x5-ja",
    version: CTC_MODEL_VERSION,
    packageId: 70086087,
    modelVersionId: 3023444,
    subdir: "quartznet15x5-ja",
    entryFile: "model.safetensors",
    // TODO: requires additional finetuning
    startOffsetSeconds: 0,
    endOffsetSeconds: 0,
  },
  citrinet1024_en: {
    name: "citrinet1024-en",
    version: CTC_MODEL_VERSION,
    packageId: 69190856,
    modelVersionId: 3023128,
    subdir: "citrinet1024-en",
    entryFile: "model.safetensors",
  },
  citrinet1024_ko: {
    name: "citrinet1024-ko",
    version: CTC_MODEL_VERSION,
    packageId: 69190862,
    modelVersionId: 3023131,
    subdir: "citrinet1024-ko",
    entryFile: "model.safetensors",
  },
  citrinet1024_uk: {
    name: "citrinet1024-uk",
    version: CTC_MODEL_VERSION,
    packageId: 69190858,
    modelVersionId: 3023129,
    subdir: "citrinet1024-uk",
    entryFile: "model.safetensors",
  },
  citrinet1024_zh: {
    name: "citrinet1024-zh",
    version: CTC_MODEL_VERSION,
    packageId: 69190861,
    modelVersionId: 3023130,
    subdir: "citrinet1024-zh",
    entryFile: "model.safetensors",
  },
  citrinet256_en: {
    name: "citrinet256-en",
    version: CTC_MODEL_VERSION,
    packageId: 69190826,
    modelVersionId: 3023116,
    subdir: "citrinet256-en",
    entryFile: "model.safetensors",
  },
  citrinet512_ca: {
    name: "citrinet512-ca",
    version: CTC_MODEL_VERSION,
    packageId: 69190848,
    modelVersionId: 3023124,
    subdir: "citrinet512-ca",
    entryFile: "model.safetensors",
  },
  citrinet512_de: {
    name: "citrinet512-de",
    version: CTC_MODEL_VERSION,
    packageId: 69190834,
    modelVersionId: 3023118,
    subdir: "citrinet512-de",
    entryFile: "model.safetensors",
  },
  citrinet512_en: {
    name: "citrinet512-en",
    version: CTC_MODEL_VERSION,
    packageId: 69190830,
    modelVersionId: 3023117,
    subdir: "citrinet512-en",
    entryFile: "model.safetensors",
  },
  citrinet512_es: {
    name: "citrinet512-es",
    version: CTC_MODEL_VERSION,
    packageId: 69190837,
    modelVersionId: 3023119,
    subdir: "citrinet512-es",
    entryFile: "model.safetensors",
  },
  citrinet512_fr: {
    name: "citrinet512-fr",
    version: CTC_MODEL_VERSION,
    packageId: 69190841,
    modelVersionId: 3023120,
    subdir: "citrinet512-fr",
    entryFile: "model.safetensors",
  },
  citrinet512_hy: {
    name: "citrinet512-hy",
    version: CTC_MODEL_VERSION,
    packageId: 69190853,
    modelVersionId: 3023126,
    subdir: "citrinet512-hy",
    entryFile: "model.safetensors",
  },
  citrinet512_it: {
    name: "citrinet512-it",
    version: CTC_MODEL_VERSION,
    packageId: 69190843,
    modelVersionId: 3023121,
    subdir: "citrinet512-it",
    entryFile: "model.safetensors",
  },
  citrinet512_nl: {
    name: "citrinet512-nl",
    version: CTC_MODEL_VERSION,
    packageId: 69190844,
    modelVersionId: 3023122,
    subdir: "citrinet512-nl",
    entryFile: "model.safetensors",
  },
  citrinet512_pt: {
    name: "citrinet512-pt",
    version: CTC_MODEL_VERSION,
    packageId: 69190846,
    modelVersionId: 3023123,
    subdir: "citrinet512-pt",
    entryFile: "model.safetensors",
  },
  citrinet512_uk: {
    name: "citrinet512-uk",
    version: CTC_MODEL_VERSION,
    packageId: 69190851,
    modelVersionId: 3023125,
    subdir: "citrinet512-uk",
    entryFile: "model.safetensors",
  },
  citrinet512_zh: {
    name: "citrinet512-zh",
    version: CTC_MODEL_VERSION,
    packageId: 69190854,
    modelVersionId: 3023127,
    subdir: "citrinet512-zh",
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
