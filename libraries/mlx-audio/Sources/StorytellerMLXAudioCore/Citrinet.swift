// I DO NOT UNDERSTAND THIS CODE
import Foundation
import MLX
import MLXNN

public struct CitrinetBlockConfig: Codable {
  public let inputChannels: Int
  public let outputChannels: Int
  public let kernel: Int
  public let stride: Int
  public let repeats: Int
  public let residual: Bool
  public let squeezeWidth: Int

  enum CodingKeys: String, CodingKey {
    case inputChannels = "in"
    case outputChannels = "out"
    case kernel, stride, residual
    case repeats = "repeat"
    case squeezeWidth = "se"
  }
}

public struct CitrinetConfig: Codable {
  public let architecture: String
  public let sampleRate: Int
  public let melBins: Int
  public let samplesPerFrame: Int
  public let blank: Int
  public let classes: Int
  public let frameOffsetSeconds: Double?
  public let tokenizer: String?
  public let blocks: [CitrinetBlockConfig]
}

final class CitrinetBlock: Module {
  @ModuleInfo(key: "dw") var depthwise: [Conv1d]
  @ModuleInfo(key: "pw") var pointwise: [Conv1d]
  @ModuleInfo(key: "se") var squeeze: [Linear]
  @ModuleInfo(key: "res") var residual: Conv1d?

  init(_ config: CitrinetBlockConfig) {
    var depthwise: [Conv1d] = []
    var pointwise: [Conv1d] = []
    for i in 0..<config.repeats {
      let channels = i == 0 ? config.inputChannels : config.outputChannels
      depthwise.append(
        Conv1d(
          inputChannels: channels, outputChannels: channels, kernelSize: config.kernel,
          stride: i == config.repeats - 1 ? config.stride : 1, padding: config.kernel / 2,
          groups: channels, bias: false))
      pointwise.append(Conv1d(inputChannels: channels, outputChannels: config.outputChannels, kernelSize: 1))
    }
    self._depthwise.wrappedValue = depthwise
    self._pointwise.wrappedValue = pointwise
    self._squeeze.wrappedValue = [
      Linear(config.outputChannels, config.squeezeWidth, bias: false),
      Linear(config.squeezeWidth, config.outputChannels, bias: false),
    ]
    self._residual.wrappedValue =
      config.residual
      ? Conv1d(
        inputChannels: config.inputChannels, outputChannels: config.outputChannels, kernelSize: 1,
        stride: config.stride)
      : nil
    super.init()
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    var y = x
    for i in 0..<pointwise.count {
      y = pointwise[i](depthwise[i](y))
      if i < pointwise.count - 1 {
        y = relu(y)
      }
    }
    let gate = sigmoid(squeeze[1](relu(squeeze[0](mean(y, axis: 1)))))
    y = y * gate.expandedDimensions(axis: 1)
    if let residual {
      y = y + residual(x)
    }
    return relu(y)
  }
}

public final class Citrinet: Module, ConvCTCModel {
  @ModuleInfo(key: "encoder") var encoder: [CitrinetBlock]
  @ModuleInfo(key: "decoder") var decoder: Conv1d

  public let config: CitrinetConfig
  public let frontend: MelFrontend
  public let vocabulary: [String: Int]

  init(config: CitrinetConfig, frontend: MelFrontend, vocabulary: [String: Int]) {
    self.config = config
    self.frontend = frontend
    self.vocabulary = vocabulary
    self._encoder.wrappedValue = config.blocks.map(CitrinetBlock.init)
    self._decoder.wrappedValue = Conv1d(
      inputChannels: config.blocks.last?.outputChannels ?? 0, outputChannels: config.classes, kernelSize: 1)
    super.init()
  }

  public var blank: Int { config.blank }

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

  public func logProbs(batch: [[Float]]) -> MLXArray {
    self(concatenated(batch.map { frontend.features($0) }, axis: 0))
  }

  public func cast(to dtype: DType) {
    update(parameters: parameters().mapValues { $0.asType(dtype) })
    eval(self)
  }

  public static func load(directory: URL) throws -> Citrinet {
    let config = try JSONDecoder().decode(
      CitrinetConfig.self, from: Data(contentsOf: directory.appendingPathComponent("config.json")))
    var weights = try loadArrays(url: directory.appendingPathComponent("model.safetensors"))
    guard let mel = weights.removeValue(forKey: "frontend.mel_filters"),
      let window = weights.removeValue(forKey: "frontend.window")
    else {
      throw QuartzNetError.missingFrontendWeights
    }
    let vocabulary = try QuartzNet.loadVocabulary(url: directory.appendingPathComponent("vocab.txt"))
    let model = Citrinet(config: config, frontend: MelFrontend(mel: mel, window: window), vocabulary: vocabulary)
    try model.update(parameters: ModuleParameters.unflattened(weights), verify: .all)
    eval(model)
    return model
  }
}
