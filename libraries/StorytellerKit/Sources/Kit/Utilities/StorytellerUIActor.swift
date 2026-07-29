import Foundation

#if canImport(Darwin)
public typealias StorytellerUIActor = MainActor
#else
import Dispatch

/// On Apple platforms UI-adjacent work rides the main actor. In JNI-hosted
/// processes (Android) the ART runtime owns the main thread and the corelibs
/// main queue never drains, so this actor supplies its own serial executor.
/// The Android corelibs Dispatch has no DispatchSerialQueue, hence the
/// hand-rolled queue-backed executor.
@globalActor
public actor StorytellerUIActor {
    public static let shared = StorytellerUIActor()

    private static let executor = SerialQueueExecutor(label: "dev.smoores.storyteller.ui-actor")

    public nonisolated var unownedExecutor: UnownedSerialExecutor {
        Self.executor.asUnownedSerialExecutor()
    }
}

private final class SerialQueueExecutor: SerialExecutor, @unchecked Sendable {
    private let queue: DispatchQueue

    init(label: String) {
        queue = DispatchQueue(label: label)
    }

    func enqueue(_ job: consuming ExecutorJob) {
        let unownedJob = UnownedJob(job)
        let unownedExecutor = asUnownedSerialExecutor()
        queue.async {
            unownedJob.runSynchronously(on: unownedExecutor)
        }
    }

    func asUnownedSerialExecutor() -> UnownedSerialExecutor {
        UnownedSerialExecutor(ordinary: self)
    }
}
#endif
