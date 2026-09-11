import Foundation
import MLX
import MLXAudioSTT
import MLXNN
import MLXFFT
import StorytellerMLXAudioCore

let args = CommandLine.arguments
guard args.count >= 3 else {
  print("usage: st-mlx-audio-cli <model-directory> <experiment> [seconds] [batch] [rounds]")
  exit(1)
}
let modelDir = URL(fileURLWithPath: args[1])
let experiment = args[2]
let seconds = args.count >= 4 ? Double(args[3]) ?? 25 : 25
let batchSize = args.count >= 5 ? Int(args[4]) ?? 1 : 1
let rounds = args.count >= 6 ? Int(args[5]) ?? 9 : 9
let count = Int(seconds * 16000)

func makeInput(_ b: Int, _ n: Int = count) -> MLXArray {
  MLXArray((0..<(n * b)).map { _ in Float.random(in: -0.3...0.3) }, [b, n])
}

struct Variant {
  let label: String
  let chunks: Double
  let body: () -> Void

  init(_ label: String, chunks: Double = Double(batchSize), _ body: @escaping () -> Void) {
    self.label = label
    self.chunks = chunks
    self.body = body
  }
}

func race(_ variants: [Variant], rounds: Int = rounds) {
  for v in variants { v.body() }
  var samples = [[Double]](repeating: [], count: variants.count)
  for _ in 0..<rounds {
    for (i, v) in variants.enumerated() {
      let start = Date()
      v.body()
      samples[i].append(Date().timeIntervalSince(start) * 1000)
    }
  }
  let baseline = samples[0].min() ?? 1
  for (i, v) in variants.enumerated() {
    let sorted = samples[i].sorted()
    let best = sorted[0]
    let median = sorted[sorted.count / 2]
    let perChunk = best / v.chunks
    let xrt = seconds / (perChunk / 1000)
    print(
      String(
        format: "%-38@ best %7.1f  med %7.1f  %6.1f ms/chunk  %6.0fx RT  %+5.1f%%",
        v.label as NSString, best, median, perChunk, xrt, (best / baseline - 1) * 100))
  }
}

switch experiment {

case "correctness":
  let real = try Wav2Vec2CTCModel.fromModelDirectory(modelDir)
  let exp = try ExpCTCModel.load(modelDir)
  let x = makeInput(batchSize).asType(.float16)
  let a = real(x).asType(.float32)
  let b = exp(x).asType(.float32)
  ExpOptions.noTranspose = true
  let c = exp(x).asType(.float32)
  ExpOptions.noTranspose = false
  ExpOptions.approxGelu = true
  let d = exp(x).asType(.float32)
  ExpOptions.approxGelu = false
  ExpOptions.convFloat32 = true
  let e = exp(x).asType(.float32)
  ExpOptions.convFloat32 = false
  ExpOptions.fusedQKV = true
  exp.fuseQKV()
  let f = exp(x).asType(.float32)
  ExpOptions.fusedQKV = false
  for (name, arr) in [
    ("replica", b), ("noTranspose", c), ("approxGelu", d), ("convF32", e), ("fusedQKV", f),
  ] {
    let diff = MLX.abs(a - arr).max().item(Float.self)
    print(String(format: "%-14@ maxabs diff %.5f (logit scale %.2f)", name as NSString, diff, MLX.abs(a).max().item(Float.self)))
  }

case "compare":
  let real = try Wav2Vec2CTCModel.fromModelDirectory(modelDir)
  let exp = try ExpCTCModel.load(modelDir)
  let x = makeInput(batchSize).asType(.float16)
  race([
    Variant("upstream") { eval(real(x)) },
    Variant("replica") { eval(exp(x)) },
  ])

case "stages":
  let model = try ExpCTCModel.load(modelDir)
  let x = makeInput(batchSize).asType(.float16)
  let feats = model.features(x)
  eval(feats)
  let h = model.project(feats)
  eval(h)
  let p = model.posConv(h)
  eval(p)
  var encTmp = p
  for i in 0..<24 { encTmp = model.layer(i, encTmp) }
  let enc = encTmp
  eval(enc)
  race([
    Variant("whole forward") { eval(model(x)) },
    Variant("conv feature extractor") { eval(model.features(x)) },
    Variant("feature projection") { eval(model.project(feats)) },
    Variant("pos conv embed") { eval(model.posConv(h)) },
    Variant("1 encoder layer") { eval(model.layer(0, p)) },
    Variant("24 encoder layers") {
      var t = p
      for i in 0..<24 { t = model.layer(i, t) }
      eval(t)
    },
    Variant("final norm + lm head") { eval(model.finish(enc)) },
    Variant("attention only x24") {
      var t = p
      for i in 0..<24 { t = model.attnOnly(i, t) }
      eval(t)
    },
    Variant("ffn only x24") {
      var t = p
      for i in 0..<24 { t = model.ffnOnly(i, t) }
      eval(t)
    },
  ])
  print("shapes: feats \(feats.shape) proj \(h.shape)")

case "convdetail":
  let model = try ExpCTCModel.load(modelDir)
  let x = makeInput(batchSize).asType(.float16)
  var variants: [Variant] = []
  var stage = x.expandedDimensions(axis: 1)
  eval(stage)
  for i in 0..<7 {
    let inp = stage
    let shape = inp.shape
    variants.append(
      Variant("conv \(i) in \(shape)") {
        ExpOptions.noTranspose = false
        eval(model.wav2vec2.featureExtractor.convLayers[i](inp))
      })
    stage = model.wav2vec2.featureExtractor.convLayers[i](inp)
    eval(stage)
  }
  variants.append(
    Variant("full conv stack (transposes)") {
      ExpOptions.noTranspose = false
      eval(model.features(x))
    })
  variants.append(
    Variant("full conv stack (no transposes)") {
      ExpOptions.noTranspose = true
      eval(model.features(x))
    })
  race(variants)
  ExpOptions.noTranspose = false

case "variants":
  let model = try ExpCTCModel.load(modelDir)
  let x = makeInput(batchSize).asType(.float16)
  func run(_ noTranspose: Bool, _ approx: Bool, _ f32: Bool, _ fused: Bool) -> () -> Void {
    {
      ExpOptions.noTranspose = noTranspose
      ExpOptions.approxGelu = approx
      ExpOptions.convFloat32 = f32
      ExpOptions.fusedQKV = fused
      eval(model(x))
      ExpOptions.noTranspose = false
      ExpOptions.approxGelu = false
      ExpOptions.convFloat32 = false
      ExpOptions.fusedQKV = false
    }
  }
  model.fuseQKV()
  race([
    Variant("baseline", run(false, false, false, false)),
    Variant("noTranspose conv", run(true, false, false, false)),
    Variant("approx gelu", run(false, true, false, false)),
    Variant("fp32 conv", run(false, false, true, false)),
    Variant("fused qkv", run(false, false, false, true)),
    Variant("noTranspose + fused qkv", run(true, false, false, true)),
    Variant("all three", run(true, true, false, true)),
  ])

case "quant":
  let x = makeInput(batchSize).asType(.float16)
  let ref = try ExpCTCModel.load(modelDir)
  var variants: [Variant] = [Variant("fp16 reference") { eval(ref(x)) }]
  for (bits, groupSize) in [(8, 64), (8, 128), (4, 64), (4, 128)] {
    let model = try ExpCTCModel.load(modelDir)
    quantize(model: model, groupSize: groupSize, bits: bits) { path, module in
      module is Linear && !path.hasSuffix("lm_head")
    }
    eval(model)
    variants.append(Variant("quantized \(bits)-bit g\(groupSize)") { eval(model(x)) })
  }
  race(variants, rounds: 5)

case "output":
  let model = try ExpCTCModel.load(modelDir)
  let x = makeInput(batchSize).asType(.float16)
  let logits = model(x)
  eval(logits)
  let samples = (0..<count).map { _ in Float.random(in: -0.3...0.3) }
  race([
    Variant("forward only") { eval(model(x)) },
    Variant("forward + asArray Float32") { _ = model(x).asArray(Float32.self) },
    Variant("forward + logsoftmax + asArray") {
      _ = logSoftMax(model(x).asType(.float32), axis: -1).asArray(Float32.self)
    },
    Variant("forward + [[Double]]") {
      let o = model(x)
      let flat = o.asArray(Float32.self)
      let nc = o.dim(-1)
      _ = (0..<(o.dim(1) * o.dim(0))).map { f -> [Double] in
        flat[f * nc..<f * nc + nc].map(Double.init)
      }
    },
    Variant("marshal [[Double]] alone") {
      let flat = logits.asArray(Float32.self)
      let nc = logits.dim(-1)
      _ = (0..<logits.dim(1)).map { f -> [Double] in flat[f * nc..<f * nc + nc].map(Double.init) }
    },
    Variant("asArray Float32 alone") { _ = logits.asArray(Float32.self) },
    Variant("mlx normalize [Float] -> array") {
      let batch = MLXArray(samples, [1, samples.count])
      let mean = MLX.mean(batch, axis: -1, keepDims: true)
      let centered = batch - mean
      let variance = MLX.mean(centered * centered, axis: -1, keepDims: true)
      eval(centered / (sqrt(variance) + 1e-7))
    },
    Variant("swift normalize [Float] -> array") {
      var sum: Float = 0
      for s in samples { sum += s }
      let mean = sum / Float(samples.count)
      var sq: Float = 0
      for s in samples { sq += (s - mean) * (s - mean) }
      let inv = 1 / (sqrt(sq / Float(samples.count)) + 1e-7)
      var norm = [Float](repeating: 0, count: samples.count)
      for i in 0..<samples.count { norm[i] = (samples[i] - mean) * inv }
      eval(MLXArray(norm, [1, norm.count]))
    },
    Variant("plain MLXArray([Float]) only") { eval(MLXArray(samples, [1, samples.count])) },
  ])

case "batch":
  let model = try ExpCTCModel.load(modelDir)
  var variants: [Variant] = []
  for b in [1, 2, 4, 6, 8] {
    let x = makeInput(b).asType(.float16)
    variants.append(Variant("batch \(b)", chunks: Double(b)) { eval(model(x)) })
  }
  race(variants, rounds: 5)

case "chunklen":
  let model = try ExpCTCModel.load(modelDir)
  for s in [5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 40.0, 60.0, 120.0] {
    let n = Int(s * 16000)
    let x = makeInput(1, n).asType(.float16)
    eval(model(x))
    var best = Double.greatestFiniteMagnitude
    for _ in 0..<5 {
      let start = Date()
      eval(model(x))
      best = min(best, Date().timeIntervalSince(start) * 1000)
    }
    print(String(format: "%6.0f s chunk: %8.1f ms  %6.0fx RT", s, best, s / (best / 1000)))
  }

case "async":
  let model = try ExpCTCModel.load(modelDir)
  let chunks = (0..<8).map { _ in makeInput(1).asType(.float16) }
  func marshal(_ o: MLXArray) -> [[Double]] {
    let flat = o.asArray(Float32.self)
    let nc = o.dim(-1)
    return (0..<o.dim(1)).map { f -> [Double] in flat[f * nc..<f * nc + nc].map(Double.init) }
  }
  race(
    [
      Variant("serial eval + [[Double]]", chunks: 8) {
        for c in chunks { _ = marshal(model(c)) }
      },
      Variant("asyncEval depth 2 + [[Double]]", chunks: 8) {
        var pending: [MLXArray] = []
        for c in chunks {
          let o = model(c)
          asyncEval(o)
          pending.append(o)
          if pending.count == 2 { _ = marshal(pending.removeFirst()) }
        }
        for p in pending { _ = marshal(p) }
      },
      Variant("serial eval + Float32 flat", chunks: 8) {
        for c in chunks { _ = model(c).asArray(Float32.self) }
      },
      Variant("asyncEval depth 2 + Float32 flat", chunks: 8) {
        var pending: [MLXArray] = []
        for c in chunks {
          let o = model(c)
          asyncEval(o)
          pending.append(o)
          if pending.count == 2 { _ = pending.removeFirst().asArray(Float32.self) }
        }
        for p in pending { _ = p.asArray(Float32.self) }
      },
    ], rounds: 5)

case "cache":
  let model = try ExpCTCModel.load(modelDir)
  let x = makeInput(batchSize).asType(.float16)
  var variants: [Variant] = []
  for limit in [512, 0, 2048, 8192] {
    variants.append(
      Variant("cacheLimit \(limit) MB") {
        GPU.set(cacheLimit: limit * 1024 * 1024)
        eval(model(x))
      })
  }
  race(variants, rounds: 5)
  GPU.set(cacheLimit: 512 * 1024 * 1024)
  print("peak MB:", GPU.peakMemory / 1_048_576)

case "qn-features", "cn-features":
  let reference = try loadArrays(url: modelDir.appendingPathComponent("reference.safetensors"))
  let model = try loadConvCTCModel(directory: modelDir)
  let samples = reference["samples"]!.asArray(Float.self)
  let features = model.frontend.features(samples)[0]
  let expected = reference["features"]!
  print("features", features.shape, "expected", expected.shape)
  print("max abs diff", abs(features - expected).max().item(Float.self))

case "qn-logprobs", "cn-logprobs":
  let reference = try loadArrays(url: modelDir.appendingPathComponent("reference.safetensors"))
  let samples = reference["samples"]!.asArray(Float.self)
  let expected = reference["logprobs"]!
  let inverse = Dictionary(uniqueKeysWithValues: (try loadConvCTCModel(directory: modelDir)).vocabulary.map { ($1, $0) })
  for dtype in [DType.float32, DType.float16] {
    let model = try loadConvCTCModel(directory: modelDir)
    model.cast(to: dtype)
    let logProbs = model.logProbs(samples: samples)[0]
    let agreement = mean(argMax(logProbs, axis: -1) .== argMax(expected, axis: -1)).item(Float.self)
    print(dtype, "shape", logProbs.shape, "expected", expected.shape)
    print("  max abs diff", abs(logProbs - expected).max().item(Float.self), "argmax agreement", agreement)
    var text = ""
    var last = -1
    for token in argMax(logProbs, axis: -1).asArray(Int32.self).map(Int.init) {
      if token != last && token != model.blank {
        text += (inverse[token] ?? "?").replacingOccurrences(of: "\u{2581}", with: " ")
      }
      last = token
    }
    print("  ", text.prefix(160))
  }

case "qn-speed", "cn-speed":
  let fp32 = try loadConvCTCModel(directory: modelDir)
  let fp16 = try loadConvCTCModel(directory: modelDir)
  fp16.cast(to: .float16)
  let samples = (0..<count).map { _ in Float.random(in: -0.3...0.3) }
  let features = fp32.frontend.features(samples)
  eval(features)
  let batched = concatenated(Array(repeating: features, count: batchSize), axis: 0)
  eval(batched)
  race([
    Variant("fp32 model only", chunks: 1) { eval(fp32(features)) },
    Variant("fp16 model only", chunks: 1) { eval(fp16(features)) },
    Variant("fp32 frontend+model", chunks: 1) { eval(fp32.logProbs(samples: samples)) },
    Variant("fp16 frontend+model", chunks: 1) { eval(fp16.logProbs(samples: samples)) },
    Variant("frontend only", chunks: 1) { eval(fp32.frontend.features(samples)) },
    Variant("fp32 model batch \(batchSize)", chunks: Double(batchSize)) { eval(fp32(batched)) },
    Variant("fp16 model batch \(batchSize)", chunks: Double(batchSize)) { eval(fp16(batched)) },
  ])
  print("peak MB:", GPU.peakMemory / 1_048_576)

case "qn-profile":
  func randomArray(_ shape: [Int]) -> MLXArray {
    MLXArray((0..<shape.reduce(1, *)).map { _ in Float.random(in: -1...1) }, shape)
  }
  let model = try QuartzNet.load(directory: modelDir)
  let samples = (0..<count).map { _ in Float.random(in: -0.3...0.3) }
  let features = model.frontend.features(samples)
  eval(features)
  let frames = features.dim(1)
  let channels = 256
  let kernel = 33
  let x = randomArray([1, frames, channels])
  let dwWeight = randomArray([channels, kernel, 1])
  let pwWeight = randomArray([channels, 1, channels])
  let unfoldWeight = randomArray([kernel, channels])
  eval(x, dwWeight, pwWeight, unfoldWeight)
  let batched = concatenated(Array(repeating: features, count: batchSize), axis: 0)
  eval(batched)
  race([
    Variant("full model batch 1", chunks: 1) { eval(model(features)) },
    Variant("full model batch \(batchSize)", chunks: Double(batchSize)) { eval(model(batched)) },
    Variant("one depthwise conv1d k33 c256", chunks: 1) { eval(conv1d(x, dwWeight, padding: 16, groups: channels)) },
    Variant("one pointwise conv1d c256", chunks: 1) { eval(conv1d(x, pwWeight)) },
    Variant("one pointwise as matmul", chunks: 1) { eval(matmul(x, pwWeight[0..., 0, 0...].transposed())) },
    Variant("one depthwise fp16 conv1d", chunks: 1) { eval(conv1d(x.asType(.float16), dwWeight.asType(.float16), padding: 16, groups: channels)) },
    Variant("one depthwise via conv2d", chunks: 1) {
      eval(conv2d(x.expandedDimensions(axis: 1), dwWeight.expandedDimensions(axis: 1), padding: [0, 16], groups: channels))
    },
    Variant("one depthwise via fft", chunks: 1) {
      let n = 4096
      let spectrum = MLXFFT.rfft(x[0].transposed(), n: n, axis: -1) * MLXFFT.rfft(dwWeight[0..., 0..., 0], n: n, axis: -1)
      eval(MLXFFT.irfft(spectrum, n: n, axis: -1)[0..., 16..<(16 + frames)].transposed())
    },
    Variant("one depthwise via unfold+sum", chunks: 1) {
      let padded = padded(x, widths: [0, [16, 16], 0])
      let unfolded = asStrided(padded, [frames, kernel, channels], strides: [channels, channels, 1])
      eval((unfolded * unfoldWeight).sum(axis: 1))
    },
  ])

case "qn-dwplan":
  func randomArray(_ shape: [Int]) -> MLXArray {
    MLXArray((0..<shape.reduce(1, *)).map { _ in Float.random(in: -1...1) }, shape)
  }
  let model = try QuartzNet.load(directory: modelDir)
  let frames = model.frontend.features((0..<count).map { _ in Float.random(in: -0.3...0.3) }).dim(1)
  var plan: [(channels: Int, kernel: Int, dilation: Int, stride: Int, layers: Int)] = []
  for block in model.config.blocks where block.kernel > 1 {
    for i in 0..<block.repeats {
      let channels = i == 0 ? block.inputChannels : block.outputChannels
      let stride = i == 0 ? block.stride : 1
      if let index = plan.firstIndex(where: { $0.channels == channels && $0.kernel == block.kernel && $0.dilation == block.dilation && $0.stride == stride }) {
        plan[index].layers += 1
      } else {
        plan.append((channels, block.kernel, block.dilation, stride, 1))
      }
    }
  }
  var totalConv = 0.0
  var totalFFT = 0.0
  for entry in plan {
    let t = entry.stride == 2 ? frames : frames / 2 + 1
    let x = randomArray([1, t, entry.channels])
    let w = randomArray([entry.channels, entry.kernel, 1])
    let span = (entry.kernel - 1) * entry.dilation + 1
    let dilated = randomArray([entry.channels, span])
    let n = 4096
    let pad = span / 2
    eval(x, w, dilated)
    func time(_ body: () -> Void) -> Double {
      body()
      var best = Double.infinity
      for _ in 0..<rounds {
        let start = Date()
        body()
        best = min(best, Date().timeIntervalSince(start) * 1000)
      }
      return best
    }
    let conv = time { eval(conv1d(x, w, stride: entry.stride, padding: pad, dilation: entry.dilation, groups: entry.channels)) }
    let fft = time {
      let spectrum = MLXFFT.rfft(x[0].transposed(), n: n, axis: -1) * MLXFFT.rfft(dilated, n: n, axis: -1)
      var y = MLXFFT.irfft(spectrum, n: n, axis: -1)[0..., pad..<(pad + t)]
      if entry.stride == 2 { y = y[0..., .stride(by: 2)] }
      eval(y.transposed())
    }
    totalConv += conv * Double(entry.layers)
    totalFFT += fft * Double(entry.layers)
    print(String(format: "c%-4d k%-3d d%d s%d x%-2d  conv %5.2f ms  fft %5.2f ms  per layer", entry.channels, entry.kernel, entry.dilation, entry.stride, entry.layers, conv, fft))
  }
  print(String(format: "depthwise total per chunk: conv %.1f ms  fft %.1f ms", totalConv, totalFFT))

default:
  print("unknown experiment", experiment)
}
