import Foundation
import MLXAudioSTT
import MLX
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
  private var bySource: [URL: Int] = [:]
  private var nextHandle = 1

  private static let cacheLimit = 512 * 1024 * 1024
  private static let foldedSpaceScore: Float = -30

  func load(directory: URL) throws -> ModelInfo {
    if let handle = bySource[directory.standardizedFileURL], let entry = entries[handle] {
      return entry.info
    }

    GPU.set(cacheLimit: Self.cacheLimit)
    let handle = nextHandle
    nextHandle += 1
    let architecture = try ConvCTCArchitecture.read(directory: directory)
    let entry: Entry
    if architecture == "citrinet" {
      let model = try Citrinet.load(directory: directory)
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
    bySource[directory.standardizedFileURL] = handle
    return entry.info
  }

  func compute(handle: Int, samples: [Float]) throws -> Emissions {
    guard let entry = entries[handle] else {
      throw ModelLoadError.notLoaded(handle: handle)
    }
    let output: MLXArray
    switch entry.model {
    case .wav2vec2(let model):
      let batch = MLXArray(samples, [1, samples.count])
      let mean = MLX.mean(batch, axis: -1, keepDims: true)
      let centered = batch - mean
      let variance = MLX.mean(centered * centered, axis: -1, keepDims: true)
      let input = centered / (sqrt(variance) + 1e-7)
      output = model(input.asType(.float16))[0]
    case .quartznet(let model):
      let logProbs = model.logProbs(samples: samples)[0]
      let blank = entry.info.blankId
      guard let space = entry.info.vocabulary["|"] else {
        throw ModelLoadError.missingSpaceToken
      }
      var folded = logProbs
      folded[0..., blank] = logAddExp(logProbs[0..., blank], logProbs[0..., space])
      folded[0..., space] = MLXArray(Self.foldedSpaceScore)
      output = folded
    case .citrinet(let model):
      output = model.logProbs(samples: samples)[0]
    }
    return Emissions(frames: output.dim(0), classes: output.dim(-1), values: output.asArray(Float32.self))
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
  case missingSpaceToken
}
