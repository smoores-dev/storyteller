import Foundation
import MLX

public protocol ConvCTCModel: AnyObject {
  var frontend: MelFrontend { get }
  var vocabulary: [String: Int] { get }
  var blank: Int { get }
  func callAsFunction(_ features: MLXArray) -> MLXArray
  func logProbs(samples: [Float]) -> MLXArray
  func cast(to dtype: DType)
}

public struct ConvCTCArchitecture: Decodable {
  public let architecture: String?

  public static func read(directory: URL) throws -> String? {
    try JSONDecoder().decode(Self.self, from: Data(contentsOf: directory.appendingPathComponent("config.json")))
      .architecture
  }
}

public enum ConvCTCModelError: Error {
  case unknownArchitecture(String?)
}

public func loadConvCTCModel(directory: URL) throws -> any ConvCTCModel {
  switch try ConvCTCArchitecture.read(directory: directory) {
  case "quartznet15x5": return try QuartzNet.load(directory: directory)
  case "citrinet": return try Citrinet.load(directory: directory)
  case let other: throw ConvCTCModelError.unknownArchitecture(other)
  }
}
