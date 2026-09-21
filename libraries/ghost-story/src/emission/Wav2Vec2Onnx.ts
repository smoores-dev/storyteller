import {
  type Tensor,
  Wav2Vec2CTCTokenizer,
  Wav2Vec2FeatureExtractor,
  Wav2Vec2ForCTC,
  log_softmax,
} from "@huggingface/transformers"

import { type CtcDataType, type ResolvedCtcDevice } from "../constants.ts"

import { type CtcBackend } from "./CtcModel.ts"
import { type Emissions } from "./Emissions.ts"

declare module "@huggingface/transformers" {
  export interface PretrainedConfig {
    conv_stride?: number[]
    conv_kernel?: number[]
  }
}

/**
 * The wav2vec2 pipeline: the transformers.js feature extractor normalises the
 * raw waveform and the ONNX encoder turns it into per frame logits. Frames
 * come from the convolutional feature encoder's strides, so the frame rate
 * and the smallest usable chunk both follow from the model config.
 */
export async function loadWav2Vec2OnnxModel(
  modelId: string,
  modelDir: string,
  device: Exclude<ResolvedCtcDevice, "mlx">,
  dtype: CtcDataType,
): Promise<CtcBackend> {
  const model = await Wav2Vec2ForCTC.from_pretrained(modelId, {
    cache_dir: modelDir,
    device,
    dtype,
    model_file_name: "model",
  })
  const tokenizer = await Wav2Vec2CTCTokenizer.from_pretrained(modelId, {
    cache_dir: modelDir,
  })
  const featureExtractor = await Wav2Vec2FeatureExtractor.from_pretrained(
    modelId,
    { cache_dir: modelDir },
  )

  const strides = model.config.conv_stride
  const kernels = model.config.conv_kernel
  if (strides === undefined || kernels === undefined) {
    throw new Error(
      `Failed to read conv_stride and conv_kernel from ${modelId} config`,
    )
  }
  let minSamples = 1
  let jump = 1
  for (let i = 0; i < kernels.length; i++) {
    minSamples += ((kernels[i] as number) - 1) * jump
    jump *= strides[i] as number
  }

  async function computeChunk(samples: Float32Array): Promise<Emissions> {
    const inputs = (await featureExtractor(samples)) as unknown
    const output = (await model.forward(inputs)) as { logits: Tensor }
    const [rows] = output.logits.tolist() as [number[][]]
    const classes = rows[0]?.length ?? 0
    const values = new Float32Array(rows.length * classes)
    rows.forEach((row, frame) => {
      values.set(log_softmax(row), frame * classes)
    })
    return { values, frames: rows.length, classes }
  }

  return {
    vocab: tokenizer.get_vocab(),
    dtype,
    samplesPerFrame: strides.reduce((a, b) => a * b, 1),
    minSamples,
    blankId: tokenizer.pad_token_id,
    async compute(chunks) {
      const results: Emissions[] = []
      for (const chunk of chunks) {
        results.push(await computeChunk(chunk))
      }
      return results
    },
    [Symbol.asyncDispose]: async () => {
      await model.dispose()
    },
  }
}
