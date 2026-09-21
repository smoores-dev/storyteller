import Foundation
import MLXAudioSTT
import MLX
import MLXNN
import StorytellerMLXAudioCore

struct ModelInfo: Sendable {
  let handle: Int
  let vocabulary: [String: Int]
  let samplesPerFrame: Int
  let minSamples: Int
  let blankId: Int
  let frameOffsetSeconds: Double
  let tokenizer: String?
}

struct Emissions: Sendable {
  let frames: Int
  let classes: Int
  let values: [Float]
}

actor ModelRegistry {
  static let shared = ModelRegistry()

  private enum Loaded {
    case wav2vec2(Wav2Vec2CTCModel)
    case quartznet(QuartzNet)
    case citrinet(Citrinet)
  }

  private struct Entry {
    let model: Loaded
    let info: ModelInfo
  }

  private var entries: [Int: Entry] = [:]
  private var bySource: [String: Int] = [:]
  private var nextHandle = 1

  private static let cacheLimit = 4096 * 1024 * 1024
  private static let foldedSpaceScore: Float = -30

  func load(directory: URL, dtype: String) throws -> ModelInfo {
    let key = "\(directory.standardizedFileURL.path)|\(dtype)"
    if let handle = bySource[key], let entry = entries[handle] {
      return entry.info
    }

    GPU.set(cacheLimit: Self.cacheLimit)
    let handle = nextHandle
    nextHandle += 1
    let architecture = try ConvCTCArchitecture.read(directory: directory)
    let entry: Entry
    if architecture == "citrinet" {
      let model = try Citrinet.load(directory: directory)
      if dtype == "fp16" {
        model.cast(to: .float16)
      }
      let info = ModelInfo(
        handle: handle,
        vocabulary: model.vocabulary,
        samplesPerFrame: model.config.samplesPerFrame,
        minSamples: MelFrontend.fftSize * 4,
        blankId: model.config.blank,
        frameOffsetSeconds: model.config.frameOffsetSeconds ?? 0,
        tokenizer: model.config.tokenizer,
      )
      entry = Entry(model: .citrinet(model), info: info)
    } else if architecture == "quartznet15x5" {
      let model = try QuartzNet.load(directory: directory)
      if dtype == "fp16" {
        model.cast(to: .float16)
      }
      var vocabulary: [String: Int] = [:]
      for (token, index) in model.vocabulary {
        switch token {
        case "<blk>": vocabulary["<blank>"] = index
        case "\u{2581}": vocabulary["|"] = index
        default: vocabulary[token] = index
        }
      }
      let info = ModelInfo(
        handle: handle,
        vocabulary: vocabulary,
        samplesPerFrame: model.config.samplesPerFrame,
        minSamples: MelFrontend.fftSize * 4,
        blankId: model.config.blank,
        frameOffsetSeconds: 0,
        tokenizer: nil,
      )
      entry = Entry(model: .quartznet(model), info: info)
    } else {
      let model = try Wav2Vec2CTCModel.fromModelDirectory(directory)
      var minSamples = 1
      var jump = 1
      for (kernel, stride) in zip(model.config.convKernel, model.config.convStride) {
        minSamples += (kernel - 1) * jump
        jump *= stride
      }
      let info = ModelInfo(
        handle: handle,
        vocabulary: Dictionary(uniqueKeysWithValues: model.defaultVocabulary.map({ ($1, $0) })),
        samplesPerFrame: model.config.convStride.reduce(1, *),
        minSamples: minSamples,
        blankId: model.config.padTokenId,
        frameOffsetSeconds: 0,
        tokenizer: nil,
      )
      entry = Entry(model: .wav2vec2(model), info: info)
    }
    entries[handle] = entry
    bySource[key] = handle
    return entry.info
  }

  func compute(handle: Int, samples: [Float], batch: Int) throws -> Emissions {
    guard let entry = entries[handle] else {
      throw ModelLoadError.notLoaded(handle: handle)
    }
    guard batch >= 1, samples.count % batch == 0 else {
      throw ModelLoadError.unevenBatch(samples: samples.count, batch: batch)
    }
    let length = samples.count / batch
    let chunks = (0..<batch).map { Array(samples[($0 * length)..<(($0 + 1) * length)]) }
    let output: MLXArray
    switch entry.model {
    case .wav2vec2(let model):
      let input = MLXArray(samples, [batch, length])
      let mean = MLX.mean(input, axis: -1, keepDims: true)
      let centered = input - mean
      let variance = MLX.mean(centered * centered, axis: -1, keepDims: true)
      let logits = model((centered / (sqrt(variance) + 1e-7)).asType(.float16))
      output = logSoftmax(logits.asType(.float32), axis: -1)
    case .quartznet(let model):
      let logProbs = model.logProbs(batch: chunks)
      if let space = entry.info.vocabulary["|"] {
        let blank = entry.info.blankId
        var folded = logProbs
        folded[0..., 0..., blank] = logAddExp(logProbs[0..., 0..., blank], logProbs[0..., 0..., space])
        folded[0..., 0..., space] = MLXArray(Self.foldedSpaceScore)
        output = folded
      } else {
        output = logProbs
      }
    case .citrinet(let model):
      output = model.logProbs(batch: chunks)
    }
    return Emissions(frames: output.dim(1), classes: output.dim(2), values: output.asArray(Float32.self))
  }

  func close(handle: Int) throws -> Bool {
    bySource = bySource.filter { $0.value != handle }
    let removed = entries.removeValue(forKey: handle) != nil
    GPU.clearCache()
    return removed
  }
}

enum ModelLoadError: Error {
  case notLoaded(handle: Int)
  case unevenBatch(samples: Int, batch: Int)
}
