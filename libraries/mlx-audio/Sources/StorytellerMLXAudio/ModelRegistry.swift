import Foundation
import MLXAudioSTT
import MLX

struct ModelInfo: Sendable {
  let handle: Int
  let vocabulary: [String: Int]
  let convKernel: [Int]
  let convStride: [Int]
  let padTokenId: Int
}

actor ModelRegistry {
  static let shared = ModelRegistry()

  private struct Entry {
    let model: Wav2Vec2CTCModel
    let info: ModelInfo
  }

  private var entries: [Int: Entry] = [:]
  private var bySource: [URL: Int] = [:]
  private var nextHandle = 1

  /// MLX keeps freed Metal buffers around for reuse and, by default, only starts
  /// releasing them once active plus cached memory nears the GPU's recommended
  /// working set (about 12 GB on a 16 GB machine). A 25 s chunk of this model
  /// peaks at a few hundred MB of activations, so this is plenty to keep the
  /// per-chunk buffers warm without hoarding gigabytes between files.
  private static let cacheLimit = 512 * 1024 * 1024

  func load(directory: URL) throws -> ModelInfo {
    if let handle = bySource[directory.standardizedFileURL], let entry = entries[handle] {
      return entry.info
    }

    GPU.set(cacheLimit: Self.cacheLimit)
    let model = try Wav2Vec2CTCModel.fromModelDirectory(directory)
    let handle = nextHandle
    nextHandle += 1
    let vocab = Dictionary(uniqueKeysWithValues: model.defaultVocabulary.map({ ($1, $0) }))
    let info = ModelInfo(
      handle: handle,
      vocabulary: vocab,
      convKernel: model.config.convKernel,
      convStride: model.config.convStride,
      padTokenId: model.config.padTokenId,
    )
    let entry = Entry(
      model: model,
      info: info
    )
    entries[handle] = entry
    bySource[directory.standardizedFileURL] = handle
    return info
  }

  func compute(handle: Int, samples: [Float]) throws -> [[Double]] {
    guard let entry = entries[handle] else {
      throw ModelLoadError.notLoaded(handle: handle)
    }
    let batch = MLXArray(samples, [1, samples.count])
    let mean = MLX.mean(batch, axis: -1, keepDims: true)
    let centered = batch - mean
    let variance = MLX.mean(centered * centered, axis: -1, keepDims: true)
    let input = centered / (sqrt(variance) + 1e-7)
    let output = entry.model(input.asType(.float16))

    let numFrames = output.dim(1)
    let numClasses = output.dim(-1)
    let flat = output.asArray(Float32.self)

    return (0..<numFrames).map { frame in
      let start = frame * numClasses
      return flat[start ..< start + numClasses].map(Double.init)
    }
  }

  func close(handle: Int) throws -> Bool {
    bySource = bySource.filter { $0.value != handle }
    let removed = entries.removeValue(forKey: handle) != nil
    // hand the weights' and activations' buffers back to the system instead of
    // leaving them in MLX's cache
    GPU.clearCache()
    return removed
  }
}

enum ModelLoadError: Error { case notLoaded(handle: Int) }
