import Foundation
import NodeAPI
import MLX

#NodeModule(exports: [
	"describe": try NodeFunction { () -> [String: NodePropertyConvertible] in
		[
			"version": "0.0.1",
			"platform": "darwin-arm64",
			"supported": true,
		]
	},
	"loadModel": try NodeFunction { (directory: String) in
		try await ModelRegistry.shared.load(directory: URL(fileURLWithPath: directory)).record
	},
	"compute": try NodeFunction { (handle: Int, samples: NodeTypedArray<Float>) async throws -> NodeValueConvertible in
		return try await ModelRegistry.shared.compute(
			handle: handle,
			samples: samples.withUnsafeMutableBytes { Array($0) }
		).map { $0 as [NodeValueConvertible] }
	},
	"closeModel": try NodeFunction { (handle: Int) async throws -> Bool in
		try await ModelRegistry.shared.close(handle: handle)
	}
])

extension ModelInfo {
  var record: [String: NodePropertyConvertible] {
    let vocab: [String: NodePropertyConvertible] = vocabulary.mapValues { $0 as NodePropertyConvertible }
    return [
      "handle": handle,
      "vocab": vocab,
      "convKernel": convKernel.map { $0 as NodeValueConvertible },
      "convStride": convStride.map { $0 as NodeValueConvertible },
      "padTokenId": padTokenId,
    ]
  }
}
