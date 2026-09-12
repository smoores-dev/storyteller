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
	"loadModel": try NodeFunction { (directory: String) throws -> NodeValueConvertible in
		let directory = URL(fileURLWithPath: directory)
		return try offloaded {
			try await ModelRegistry.shared.load(directory: directory)
		} then: { info in
			info.record
		}
	},
	"compute": try NodeFunction { (handle: Int, samples: NodeTypedArray<Float>) throws -> NodeValueConvertible in
		let samples = try samples.withUnsafeMutableRawBytes {
			Array(UnsafeMutableBufferPointer(start: $0.baseAddress?.assumingMemoryBound(to: Float.self), count: $0.count))
		}
		return try offloaded {
			try await ModelRegistry.shared.compute(handle: handle, samples: samples)
		} then: { emissions in
			let buffer = try NodeArrayBuffer(capacity: emissions.values.count * MemoryLayout<Float>.size)
			try buffer.withUnsafeMutableBytes { bytes in
				emissions.values.withUnsafeBytes { bytes.copyMemory(from: $0) }
			}
			let record: [String: NodePropertyConvertible] = [
				"frames": emissions.frames,
				"classes": emissions.classes,
				"values": try NodeTypedArray<Float>(for: buffer, count: emissions.values.count),
			]
			return record
		}
	},
	"closeModel": try NodeFunction { (handle: Int) throws -> NodeValueConvertible in
		try offloaded {
			try await ModelRegistry.shared.close(handle: handle)
		} then: { removed in
			removed
		}
	}
])

private struct Unchecked<Value>: @unchecked Sendable {
	let value: Value
}

private enum Bridge {
	@NodeInstanceData static var queue: NodeAsyncQueue?
}

@NodeActor
private func nodeQueue() throws -> NodeAsyncQueue {
	if let queue = Bridge.queue {
		return queue
	}
	let queue = try NodeAsyncQueue(label: "StorytellerMLXAudio")
	Bridge.queue = queue
	return queue
}

// Needed, bc otherwise we get this error after spinning up a second worker
// Error: There is no target NodeAsyncQueue associated with this Task, and there is no global default queue.

// Basically: node-swift delegates async work to a global default queue
// but that assumption of "there is one queue" is wrong the moment this plugin gets loaded for the second time
// therefore, we need to manually handle a task queue

// see 
// - https://github.com/kabiroberai/node-swift/issues/7 (decision that lead to this)
// - https://github.com/kabiroberai/node-swift/issues/51 (discussion)
@NodeActor
private func offloaded<Value: Sendable>(
	_ work: @escaping @Sendable () async throws -> Value,
	then finish: @escaping @Sendable @NodeActor (Value) throws -> NodeValueConvertible
) throws -> NodePromise {
	let queue = try nodeQueue()
	let keepAlive = try queue.handle()
	return try NodePromise { deferred in
		let deferred = Unchecked(value: deferred)
		Task.detached(priority: .userInitiated) {
			let result: Result<Value, any Error>
			do {
				result = .success(try await work())
			} catch {
				result = .failure(error)
			}
			try? queue.run {
				let outcome: Result<NodeValueConvertible, any Error>
				do {
					outcome = .success(try finish(result.get()))
				} catch {
					outcome = .failure(error)
				}
				try deferred.value(outcome)
			}
			withExtendedLifetime(keepAlive) {}
		}
	}
}

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
