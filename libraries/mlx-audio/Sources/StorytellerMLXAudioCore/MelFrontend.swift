// I DO NOT UNDERSTAND THIS CODE
import Foundation
import MLX
import MLXFFT

public struct MelFrontend {
  public static let fftSize = 512
  public static let hop = 160
  static let preEmphasis: Float = 0.97

  let mel: MLXArray
  let window: MLXArray

  public init(mel: MLXArray, window: MLXArray) {
    self.mel = mel
    self.window = window
  }

  func paddedSignal(_ samples: [Float]) -> [Float] {
    let pad = Self.fftSize / 2
    precondition(samples.count > pad, "need more than \(pad) samples")
    var padded = [Float](repeating: 0, count: samples.count + 2 * pad)
    for i in 0..<samples.count {
      padded[pad + i] = i == 0 ? samples[0] : samples[i] - Self.preEmphasis * samples[i - 1]
    }
    for j in 1...pad {
      padded[pad - j] = padded[pad + j]
      padded[pad + samples.count - 1 + j] = padded[pad + samples.count - 1 - j]
    }
    return padded
  }

  public func features(_ samples: [Float]) -> MLXArray {
    let padded = paddedSignal(samples)
    let frameCount = 1 + (padded.count - Self.fftSize) / Self.hop
    let frames = asStrided(MLXArray(padded), [frameCount, Self.fftSize], strides: [Self.hop, 1]) * window
    let power = square(abs(MLXFFT.rfft(frames, axis: -1)))
    let logMel = log(matmul(power, mel) + Float(1.0 / 16_777_216.0))
    let center = mean(logMel, axis: 0, keepDims: true)
    let scale = sqrt(variance(logMel, axis: 0, keepDims: true, ddof: 1)) + 1e-5
    return expandedDimensions((logMel - center) / scale, axis: 0)
  }
}
