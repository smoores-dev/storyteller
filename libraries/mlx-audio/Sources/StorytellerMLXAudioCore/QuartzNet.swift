import Foundation
import MLX
import MLXFFT
import MLXNN

public struct QuartzNetBlockConfig: Codable {
  public let inputChannels: Int
  public let outputChannels: Int
  public let kernel: Int
  public let stride: Int
  public let dilation: Int
  public let repeats: Int
  public let residual: Bool

  enum CodingKeys: String, CodingKey {
    case inputChannels = "in"
    case outputChannels = "out"
    case kernel, stride, dilation, residual
    case repeats = "repeat"
  }
}

public struct QuartzNetConfig: Codable {
  public let architecture: String
  public let sampleRate: Int
  public let melBins: Int
  public let samplesPerFrame: Int
  public let blank: Int
  public let classes: Int
  public let blocks: [QuartzNetBlockConfig]
}

public enum QuartzNetError: Error {
  case missingFrontendWeights
  case badVocabularyLine(String)
}

final class DepthwiseConv: Module {
  let stride: Int
  let dilation: Int
  let kernel: Int

  @ParameterInfo(key: "weight") var weight: MLXArray
  private var spectra: [Int: MLXArray] = [:]

  init(channels: Int, kernel: Int, stride: Int, dilation: Int) {
    self.stride = stride
    self.dilation = dilation
    self.kernel = kernel
    self._weight.wrappedValue = MLXArray.zeros([channels, kernel, 1])
    super.init()
  }

  var span: Int { (kernel - 1) * dilation + 1 }

  func spectrum(length: Int) -> MLXArray {
    if let cached = spectra[length] {
      return cached
    }
    let channels = weight.dim(0)
    var flipped = MLXArray.zeros([channels, span], dtype: weight.dtype)
    for j in 0..<kernel {
      flipped[0..., (kernel - 1 - j) * dilation] = weight[0..., j, 0]
    }
    let result = MLXFFT.rfft(flipped, n: length, axis: -1)
    eval(result)
    spectra[length] = result
    return result
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    let frames = x.dim(1)
    let pad = span / 2
    var length = 1
    while length < frames + span - 1 {
      length *= 2
    }
    let signal = MLXFFT.rfft(x.transposed(0, 2, 1), n: length, axis: -1)
    var y = MLXFFT.irfft(signal * spectrum(length: length), n: length, axis: -1)[0..., 0..., pad..<(pad + frames)]
    if stride > 1 {
      y = y[0..., 0..., .stride(by: stride)]
    }
    return y.transposed(0, 2, 1).asType(x.dtype)
  }
}

final class QuartzNetBlock: Module {
  @ModuleInfo(key: "dw") var depthwise: [DepthwiseConv]
  @ModuleInfo(key: "pw") var pointwise: [Conv1d]
  @ModuleInfo(key: "res") var residual: Conv1d?

  init(_ config: QuartzNetBlockConfig) {
    var depthwise: [DepthwiseConv] = []
    var pointwise: [Conv1d] = []
    for i in 0..<config.repeats {
      let channels = i == 0 ? config.inputChannels : config.outputChannels
      if config.kernel > 1 {
        depthwise.append(
          DepthwiseConv(
            channels: channels, kernel: config.kernel, stride: i == 0 ? config.stride : 1,
            dilation: config.dilation))
      }
      pointwise.append(Conv1d(inputChannels: channels, outputChannels: config.outputChannels, kernelSize: 1))
    }
    self._depthwise.wrappedValue = depthwise
    self._pointwise.wrappedValue = pointwise
    self._residual.wrappedValue =
      config.residual
      ? Conv1d(inputChannels: config.inputChannels, outputChannels: config.outputChannels, kernelSize: 1)
      : nil
    super.init()
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    var y = x
    for i in 0..<pointwise.count {
      if !depthwise.isEmpty {
        y = depthwise[i](y)
      }
      y = pointwise[i](y)
      if i < pointwise.count - 1 {
        y = relu(y)
      }
    }
    if let residual {
      y = y + residual(x)
    }
    return relu(y)
  }
}

public final class QuartzNet: Module {
  @ModuleInfo(key: "encoder") var encoder: [QuartzNetBlock]
  @ModuleInfo(key: "decoder") var decoder: Conv1d

  public let config: QuartzNetConfig
  public let frontend: MelFrontend
  public let vocabulary: [String: Int]

  init(config: QuartzNetConfig, frontend: MelFrontend, vocabulary: [String: Int]) {
    self.config = config
    self.frontend = frontend
    self.vocabulary = vocabulary
    self._encoder.wrappedValue = config.blocks.map(QuartzNetBlock.init)
    self._decoder.wrappedValue = Conv1d(
      inputChannels: config.blocks.last?.outputChannels ?? 0, outputChannels: config.classes, kernelSize: 1)
    super.init()
  }

  public var dtype: DType { decoder.weight.dtype }

  public func callAsFunction(_ features: MLXArray) -> MLXArray {
    var y = features.asType(dtype)
    for block in encoder {
      y = block(y)
    }
    return logSoftmax(decoder(y).asType(.float32), axis: -1)
  }

  public func logProbs(samples: [Float]) -> MLXArray {
    self(frontend.features(samples))
  }

  public func cast(to dtype: DType) {
    update(parameters: parameters().mapValues { $0.asType(dtype) })
    eval(self)
  }

  public static func load(directory: URL) throws -> QuartzNet {
    let config = try JSONDecoder().decode(
      QuartzNetConfig.self, from: Data(contentsOf: directory.appendingPathComponent("config.json")))
    var weights = try loadArrays(url: directory.appendingPathComponent("model.safetensors"))
    guard let mel = weights.removeValue(forKey: "frontend.mel_filters"),
      let window = weights.removeValue(forKey: "frontend.window")
    else {
      throw QuartzNetError.missingFrontendWeights
    }
    let vocabulary = try loadVocabulary(url: directory.appendingPathComponent("vocab.txt"))
    let model = QuartzNet(config: config, frontend: MelFrontend(mel: mel, window: window), vocabulary: vocabulary)
    try model.update(parameters: ModuleParameters.unflattened(weights), verify: .all)
    eval(model)
    return model
  }

  static func loadVocabulary(url: URL) throws -> [String: Int] {
    var vocabulary: [String: Int] = [:]
    for line in try String(contentsOf: url, encoding: .utf8).split(separator: "\n") {
      guard let space = line.lastIndex(of: " "), let index = Int(line[line.index(after: space)...]) else {
        throw QuartzNetError.badVocabularyLine(String(line))
      }
      vocabulary[String(line[..<space])] = index
    }
    return vocabulary
  }
}
