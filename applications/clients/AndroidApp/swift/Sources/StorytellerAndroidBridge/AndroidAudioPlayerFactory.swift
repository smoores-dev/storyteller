import Foundation
import StorytellerKit
import SwiftJava
import Synchronization

@JavaClass("dev.smoores.storyteller.platform.AndroidAudioPlayerBridge")
open class JavaAndroidAudioPlayerBridge: JavaObject {}

extension JavaClass<JavaAndroidAudioPlayerBridge> {
    @JavaStaticMethod
    func load(_ playerID: String, _ loadID: String, _ localPath: String)

    @JavaStaticMethod
    func play(_ playerID: String)

    @JavaStaticMethod
    func pause(_ playerID: String)

    @JavaStaticMethod
    func stop(_ playerID: String)

    @JavaStaticMethod
    func seek(_ playerID: String, _ seconds: Double)

    @JavaStaticMethod
    func currentTime(_ playerID: String) -> Double

    @JavaStaticMethod
    func duration(_ playerID: String) -> Double

    @JavaStaticMethod
    func setRate(_ playerID: String, _ rate: Double)

    @JavaStaticMethod
    func setVolume(_ playerID: String, _ volume: Double)

    @JavaStaticMethod
    func release(_ playerID: String)
}

struct AndroidAudioPlayerFactory: AudioPlayerFactory {
    func makePlayer(profile: AudioPlaybackProfile) -> any AudioPlaying {
        AndroidAudioPlayer()
    }

    // ExoPlayer is configured to own Android audio-focus and noisy-route policy.
    func prepareSession(longForm: Bool) async throws {}

    func deactivateSession() async {}
}

private enum AndroidAudioPlayerError: Error, LocalizedError {
    case loadReplaced
    case loadFailed(String)

    var errorDescription: String? {
        switch self {
            case .loadReplaced:
                return "Audio load was replaced"
            case .loadFailed(let message):
                return message
        }
    }
}

/// Android's AudioPlaying implementation; delegates transport to its Kotlin Exo backend.
private actor AndroidAudioPlayer: AudioPlaying {
    private struct PendingLoad {
        let id: String
        let continuation: CheckedContinuation<TimeInterval, any Error>
    }

    private let playerID = UUID().uuidString
    private var activeLoadID: String?
    private var pendingLoad: PendingLoad?
    private var eventHandler: (@Sendable (AudioPlayerEvent) -> Void)?

    init() {
        AndroidAudioPlayerCallbacks.register(self, id: playerID)
    }

    deinit {
        AndroidAudioPlayerCallbacks.unregister(id: playerID)
        try? JavaClass<JavaAndroidAudioPlayerBridge>().release(playerID)
    }

    func load(url: URL) async throws -> TimeInterval {
        cancelPendingLoad(with: AndroidAudioPlayerError.loadReplaced)

        let loadID = UUID().uuidString
        activeLoadID = loadID
        return try await withCheckedThrowingContinuation { continuation in
            pendingLoad = PendingLoad(id: loadID, continuation: continuation)
            do {
                try JavaClass<JavaAndroidAudioPlayerBridge>().load(
                    playerID,
                    loadID,
                    url.path,
                )
            } catch {
                pendingLoad = nil
                activeLoadID = nil
                continuation.resume(throwing: error)
            }
        }
    }

    func play() {
        try? JavaClass<JavaAndroidAudioPlayerBridge>().play(playerID)
    }

    func pause() {
        try? JavaClass<JavaAndroidAudioPlayerBridge>().pause(playerID)
    }

    func stop() {
        cancelPendingLoad(with: CancellationError())
        activeLoadID = nil
        try? JavaClass<JavaAndroidAudioPlayerBridge>().stop(playerID)
    }

    func seek(to seconds: TimeInterval) {
        try? JavaClass<JavaAndroidAudioPlayerBridge>().seek(playerID, seconds)
    }

    var currentTime: TimeInterval {
        (try? JavaClass<JavaAndroidAudioPlayerBridge>().currentTime(playerID)) ?? 0
    }

    var duration: TimeInterval {
        (try? JavaClass<JavaAndroidAudioPlayerBridge>().duration(playerID)) ?? 0
    }

    func setRate(_ rate: Double) {
        try? JavaClass<JavaAndroidAudioPlayerBridge>().setRate(playerID, rate)
    }

    func setVolume(_ volume: Double) {
        try? JavaClass<JavaAndroidAudioPlayerBridge>().setVolume(playerID, volume)
    }

    func setEventHandler(_ handler: @escaping @Sendable (AudioPlayerEvent) -> Void) {
        eventHandler = handler
    }

    fileprivate func handleLoadCompletion(
        loadID: String,
        duration: TimeInterval,
        error: String,
    ) {
        guard activeLoadID == loadID,
            let pendingLoad,
            pendingLoad.id == loadID
        else {
            return
        }

        self.pendingLoad = nil
        if error.isEmpty {
            pendingLoad.continuation.resume(returning: max(0, duration))
        } else {
            activeLoadID = nil
            pendingLoad.continuation.resume(
                throwing: AndroidAudioPlayerError.loadFailed(error)
            )
        }
    }

    fileprivate func handlePlayerEvent(loadID: String, event: String, flag: Bool) {
        guard activeLoadID == loadID else { return }

        switch event {
            case "finished":
                eventHandler?(.didFinishPlaying)
            case "interruptionBegan":
                eventHandler?(.interruptionBegan)
            case "routeChanged":
                eventHandler?(.routeChanged(shouldPause: flag))
            default:
                break
        }
    }

    private func cancelPendingLoad(with error: any Error) {
        pendingLoad?.continuation.resume(throwing: error)
        pendingLoad = nil
    }
}

private final class WeakAndroidAudioPlayer: @unchecked Sendable {
    weak var value: AndroidAudioPlayer?

    init(_ value: AndroidAudioPlayer) {
        self.value = value
    }
}

/// Resolves callbacks from Kotlin's static JNI surface to the produced Swift player.
private enum AndroidAudioPlayerCallbacks {
    private static let players = Mutex<[String: WeakAndroidAudioPlayer]>([:])

    static func register(_ player: AndroidAudioPlayer, id: String) {
        players.withLock { $0[id] = WeakAndroidAudioPlayer(player) }
    }

    static func unregister(id: String) {
        players.withLock { $0[id] = nil }
    }

    static func player(id: String) -> AndroidAudioPlayer? {
        players.withLock { players in
            guard let player = players[id]?.value else {
                players[id] = nil
                return nil
            }
            return player
        }
    }
}

/// Kotlin-to-Swift completion for ExoPlayer's asynchronous prepare operation.
public func androidAudioPlayerLoadDidComplete(
    playerID: String,
    loadID: String,
    durationSeconds: Double,
    error: String,
) async {
    guard let player = AndroidAudioPlayerCallbacks.player(id: playerID) else { return }
    await player.handleLoadCompletion(
        loadID: loadID,
        duration: durationSeconds,
        error: error,
    )
}

/// Kotlin-to-Swift delivery for events belonging to the currently loaded file.
public func androidAudioPlayerEvent(
    playerID: String,
    loadID: String,
    event: String,
    flag: Bool,
) async {
    guard let player = AndroidAudioPlayerCallbacks.player(id: playerID) else { return }
    await player.handlePlayerEvent(loadID: loadID, event: event, flag: flag)
}
