import Foundation
import MLX
import MLXAudioSTT
import MLXFast
import MLXNN

enum ExpOptions {
  nonisolated(unsafe) static var noTranspose = false
  nonisolated(unsafe) static var approxGelu = false
  nonisolated(unsafe) static var convFloat32 = false
  nonisolated(unsafe) static var fusedQKV = false
}

private func act(_ x: MLXArray) -> MLXArray {
  ExpOptions.approxGelu ? geluFastApproximate(x) : gelu(x)
}

final class ExpConvNorm: Module, UnaryLayer {
  let eps: Float
  @ParameterInfo var weight: MLXArray
  @ParameterInfo var bias: MLXArray

  init(dimensions: Int, eps: Float) {
    self.eps = eps
    _weight.wrappedValue = MLXArray.ones([dimensions])
    _bias.wrappedValue = MLXArray.zeros([dimensions])
    super.init()
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    MLXFast.layerNorm(x, weight: weight.asType(x.dtype), bias: bias.asType(x.dtype), eps: eps)
  }
}

final class ExpConvLayer: Module {
  @ModuleInfo var conv: Conv1d
  @ModuleInfo(key: "layer_norm") var norm: ExpConvNorm

  init(config: Wav2Vec2STTConfig, layerId: Int) {
    let inputChannels = layerId > 0 ? config.convDim[layerId - 1] : 1
    let outputChannels = config.convDim[layerId]
    _conv.wrappedValue = Conv1d(
      inputChannels: inputChannels,
      outputChannels: outputChannels,
      kernelSize: config.convKernel[layerId],
      stride: config.convStride[layerId],
      bias: config.convBias
    )
    _norm.wrappedValue = ExpConvNorm(dimensions: outputChannels, eps: config.layerNormEps)
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    if ExpOptions.noTranspose {
      return act(norm(conv(x)))
    }
    var out = conv(x.transposed(0, 2, 1))
    out = norm(out)
    out = out.transposed(0, 2, 1)
    return act(out)
  }
}

final class ExpFeatureExtractor: Module {
  @ModuleInfo(key: "conv_layers") var convLayers: [ExpConvLayer]

  init(config: Wav2Vec2STTConfig) {
    _convLayers.wrappedValue = (0..<config.numFeatExtractLayers).map {
      ExpConvLayer(config: config, layerId: $0)
    }
  }

  func callAsFunction(_ inputValues: MLXArray) -> MLXArray {
    var x = ExpOptions.noTranspose
      ? inputValues.expandedDimensions(axis: -1)
      : inputValues.expandedDimensions(axis: 1)
    if ExpOptions.convFloat32 {
      x = x.asType(.float32)
    }
    for layer in convLayers {
      x = layer(x)
    }
    return x
  }
}

final class ExpFeatureProjection: Module {
  @ModuleInfo(key: "layer_norm") var layerNorm: LayerNorm
  @ModuleInfo var projection: Linear

  init(config: Wav2Vec2STTConfig) {
    _layerNorm.wrappedValue = LayerNorm(dimensions: config.convDim.last ?? 512, eps: config.layerNormEps)
    _projection.wrappedValue = Linear(config.convDim.last ?? 512, config.hiddenSize)
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    projection(layerNorm(x))
  }
}

final class ExpPosConv: Module {
  let removeLast: Bool
  @ModuleInfo var conv: Conv1d

  init(config: Wav2Vec2STTConfig) {
    self.removeLast = config.numConvPosEmbeddings % 2 == 0
    _conv.wrappedValue = Conv1d(
      inputChannels: config.hiddenSize,
      outputChannels: config.hiddenSize,
      kernelSize: config.numConvPosEmbeddings,
      padding: config.numConvPosEmbeddings / 2,
      groups: config.numConvPosEmbeddingGroups,
      bias: true
    )
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    var out = conv(x)
    if removeLast && out.dim(1) > 0 {
      out = out[0..., ..<(out.dim(1) - 1), 0...]
    }
    return act(out)
  }
}

final class ExpAttention: Module {
  let numHeads: Int
  let headDim: Int
  let scale: Float

  @ModuleInfo(key: "k_proj") var kProj: Linear
  @ModuleInfo(key: "v_proj") var vProj: Linear
  @ModuleInfo(key: "q_proj") var qProj: Linear
  @ModuleInfo(key: "out_proj") var outProj: Linear

  init(config: Wav2Vec2STTConfig) {
    self.numHeads = config.numAttentionHeads
    self.headDim = config.hiddenSize / config.numAttentionHeads
    self.scale = pow(Float(headDim), -0.5)
    _kProj.wrappedValue = Linear(config.hiddenSize, config.hiddenSize)
    _vProj.wrappedValue = Linear(config.hiddenSize, config.hiddenSize)
    _qProj.wrappedValue = Linear(config.hiddenSize, config.hiddenSize)
    _outProj.wrappedValue = Linear(config.hiddenSize, config.hiddenSize)
  }

  var fusedWeight: MLXArray?
  var fusedBias: MLXArray?

  func fuse() {
    fusedWeight = MLX.concatenated([qProj.weight, kProj.weight, vProj.weight], axis: 0)
    if let qb = qProj.bias, let kb = kProj.bias, let vb = vProj.bias {
      fusedBias = MLX.concatenated([qb, kb, vb], axis: 0)
    }
    eval(fusedWeight!, fusedBias!)
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    let batch = x.dim(0)
    let time = x.dim(1)
    let q: MLXArray
    let k: MLXArray
    let v: MLXArray
    if ExpOptions.fusedQKV, let fusedWeight, let fusedBias {
      let qkv = MLX.addMM(fusedBias, x, fusedWeight.transposed())
        .reshaped(batch, time, 3, numHeads, headDim)
        .transposed(2, 0, 3, 1, 4)
      q = qkv[0]
      k = qkv[1]
      v = qkv[2]
    } else {
      q = qProj(x).reshaped(batch, time, numHeads, headDim).transposed(0, 2, 1, 3)
      k = kProj(x).reshaped(batch, time, numHeads, headDim).transposed(0, 2, 1, 3)
      v = vProj(x).reshaped(batch, time, numHeads, headDim).transposed(0, 2, 1, 3)
    }
    let attended = MLXFast.scaledDotProductAttention(
      queries: q, keys: k, values: v, scale: scale, mask: nil)
    return outProj(attended.transposed(0, 2, 1, 3).reshaped(batch, time, -1))
  }
}

final class ExpFeedForward: Module {
  @ModuleInfo(key: "intermediate_dense") var intermediateDense: Linear
  @ModuleInfo(key: "output_dense") var outputDense: Linear

  init(config: Wav2Vec2STTConfig) {
    _intermediateDense.wrappedValue = Linear(config.hiddenSize, config.intermediateSize)
    _outputDense.wrappedValue = Linear(config.intermediateSize, config.hiddenSize)
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    outputDense(act(intermediateDense(x)))
  }
}

final class ExpEncoderLayer: Module {
  @ModuleInfo var attention: ExpAttention
  @ModuleInfo(key: "layer_norm") var layerNorm: LayerNorm
  @ModuleInfo(key: "feed_forward") var feedForward: ExpFeedForward
  @ModuleInfo(key: "final_layer_norm") var finalLayerNorm: LayerNorm

  init(config: Wav2Vec2STTConfig) {
    _attention.wrappedValue = ExpAttention(config: config)
    _layerNorm.wrappedValue = LayerNorm(dimensions: config.hiddenSize, eps: config.layerNormEps)
    _feedForward.wrappedValue = ExpFeedForward(config: config)
    _finalLayerNorm.wrappedValue = LayerNorm(dimensions: config.hiddenSize, eps: config.layerNormEps)
    super.init()
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    var out = x + attention(layerNorm(x))
    out = out + feedForward(finalLayerNorm(out))
    return out
  }
}

final class ExpEncoder: Module {
  @ModuleInfo(key: "pos_conv_embed") var posConvEmbed: ExpPosConv
  @ModuleInfo(key: "layer_norm") var layerNorm: LayerNorm
  @ModuleInfo var layers: [ExpEncoderLayer]

  init(config: Wav2Vec2STTConfig) {
    _posConvEmbed.wrappedValue = ExpPosConv(config: config)
    _layerNorm.wrappedValue = LayerNorm(dimensions: config.hiddenSize, eps: config.layerNormEps)
    _layers.wrappedValue = (0..<config.numHiddenLayers).map { _ in ExpEncoderLayer(config: config) }
    super.init()
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    var out = x + posConvEmbed(x)
    for layer in layers {
      out = layer(out)
    }
    return out
  }
}

final class ExpBase: Module {
  @ModuleInfo(key: "feature_extractor") var featureExtractor: ExpFeatureExtractor
  @ModuleInfo(key: "feature_projection") var featureProjection: ExpFeatureProjection
  @ModuleInfo var encoder: ExpEncoder

  init(config: Wav2Vec2STTConfig) {
    _featureExtractor.wrappedValue = ExpFeatureExtractor(config: config)
    _featureProjection.wrappedValue = ExpFeatureProjection(config: config)
    _encoder.wrappedValue = ExpEncoder(config: config)
    super.init()
  }
}

final class ExpCTCModel: Module {
  let config: Wav2Vec2STTConfig
  @ModuleInfo var wav2vec2: ExpBase
  @ModuleInfo(key: "lm_head") var lmHead: Linear

  init(config: Wav2Vec2STTConfig) {
    self.config = config
    _wav2vec2.wrappedValue = ExpBase(config: config)
    _lmHead.wrappedValue = Linear(config.hiddenSize, config.vocabSize)
    super.init()
  }

  func features(_ x: MLXArray) -> MLXArray {
    var f = wav2vec2.featureExtractor(x)
    if !ExpOptions.noTranspose {
      f = f.transposed(0, 2, 1)
    }
    return f
  }

  func project(_ f: MLXArray) -> MLXArray {
    wav2vec2.featureProjection(ExpOptions.convFloat32 ? f.asType(.float16) : f)
  }

  func posConv(_ h: MLXArray) -> MLXArray {
    h + wav2vec2.encoder.posConvEmbed(h)
  }

  func layer(_ i: Int, _ h: MLXArray) -> MLXArray {
    wav2vec2.encoder.layers[i](h)
  }

  func finish(_ h: MLXArray) -> MLXArray {
    lmHead(wav2vec2.encoder.layerNorm(h))
  }

  func attnOnly(_ i: Int, _ h: MLXArray) -> MLXArray {
    let l = wav2vec2.encoder.layers[i]
    return h + l.attention(l.layerNorm(h))
  }

  func ffnOnly(_ i: Int, _ h: MLXArray) -> MLXArray {
    let l = wav2vec2.encoder.layers[i]
    return h + l.feedForward(l.finalLayerNorm(h))
  }

  func fuseQKV() {
    for l in wav2vec2.encoder.layers { l.attention.fuse() }
  }

  func callAsFunction(_ x: MLXArray) -> MLXArray {
    finish(wav2vec2.encoder(project(features(x))))
  }

  static func load(_ modelDir: URL) throws -> ExpCTCModel {
    let configURL = modelDir.appendingPathComponent("config.json")
    let config = try JSONDecoder().decode(Wav2Vec2STTConfig.self, from: Data(contentsOf: configURL))
    let model = ExpCTCModel(config: config)

    let files = try FileManager.default.contentsOfDirectory(at: modelDir, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "safetensors" && !$0.lastPathComponent.hasPrefix("adapter.") }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
    var weights: [String: MLXArray] = [:]
    for file in files {
      weights.merge(try MLX.loadArrays(url: file)) { _, new in new }
    }

    var sanitized: [String: MLXArray] = [:]
    var g: MLXArray?
    var v: MLXArray?
    for (rawKey, rawValue) in weights {
      var key = rawKey
      var value = rawValue
      if key.hasPrefix("quantizer.") || key.hasPrefix("wav2vec2.quantizer.")
        || key.hasPrefix("project_") || key.hasPrefix("wav2vec2.project_")
        || key == "masked_spec_embed" || key == "wav2vec2.masked_spec_embed" {
        continue
      }
      if key.hasSuffix(".parametrizations.weight.original0") {
        key = key.replacingOccurrences(of: ".parametrizations.weight.original0", with: ".weight_g")
        if value.ndim == 3 { value = value.transposed(0, 2, 1) }
      } else if key.hasSuffix(".parametrizations.weight.original1") {
        key = key.replacingOccurrences(of: ".parametrizations.weight.original1", with: ".weight_v")
        if value.ndim == 3 { value = value.transposed(0, 2, 1) }
      } else if key.hasSuffix(".conv.weight") && value.ndim == 3 {
        value = value.transposed(0, 2, 1)
      } else if (key.hasSuffix(".conv.weight_g") || key.hasSuffix(".conv.weight_v")) && value.ndim == 3 {
        value = value.transposed(0, 2, 1)
      }
      if key.hasSuffix("encoder.pos_conv_embed.conv.weight_g") { g = value; continue }
      if key.hasSuffix("encoder.pos_conv_embed.conv.weight_v") { v = value; continue }
      sanitized[key] = value
    }
    if let g, let v {
      let norm = sqrt(sum(v * v, axes: [0, 2], keepDims: true) + 1e-12)
      sanitized["wav2vec2.encoder.pos_conv_embed.conv.weight"] = g * v / norm
    }

    try model.update(parameters: ModuleParameters.unflattened(sanitized), verify: .noUnusedKeys)
    model.train(false)
    eval(model)
    return model
  }
}
