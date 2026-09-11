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
	"compute": try NodeFunction { (handle: Int, samples: NodeTypedArray<Float>) async throws -> [String: NodePropertyConvertible] in
		let emissions = try await ModelRegistry.shared.compute(
			handle: handle,
			samples: samples.withUnsafeMutableRawBytes {
				Array(UnsafeMutableBufferPointer(start: $0.baseAddress?.assumingMemoryBound(to: Float.self), count: $0.count))
			}
		)
		let buffer = try NodeArrayBuffer(capacity: emissions.values.count * MemoryLayout<Float>.size)
		try buffer.withUnsafeMutableBytes { bytes in
			emissions.values.withUnsafeBytes { bytes.copyMemory(from: $0) }
		}
		return [
			"frames": emissions.frames,
			"classes": emissions.classes,
			"values": try NodeTypedArray<Float>(for: buffer, count: emissions.values.count),
		]
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
      "samplesPerFrame": samplesPerFrame,
      "minSamples": minSamples,
      "blankId": blankId,
      "frameOffsetSeconds": frameOffsetSeconds,
      "tokenizer": tokenizer,
    ]
  }
}
