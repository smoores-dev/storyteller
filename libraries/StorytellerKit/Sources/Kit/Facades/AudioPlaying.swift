import Foundation

/// Which playback pipeline the caller is driving. Apple players map these to
/// AVPlayer (SMIL segment files) and AVAudioPlayer (audiobook tracks) to keep
/// the previous behavior of each; other platforms may ignore the distinction.
public enum AudioPlaybackProfile: Sendable {
    case smilSegment
    case audiobookTrack
}

public enum AudioPlayerEvent: Sendable {
    case didFinishPlaying
    case interruptionBegan
    case interruptionEnded(shouldResume: Bool)
    /// The active output route went away (e.g. headphones unplugged).
    case routeChanged(shouldPause: Bool)
}

/// One playback instance. Implementations own the underlying player and the
/// delivery of player events; orchestration (entry state machines, chapter
/// logic, progress) lives in the core actors that drive this protocol.
public protocol AudioPlaying: AnyObject, Sendable {
    /// Loads a local audio file and returns its duration.
    func load(url: URL) async throws -> TimeInterval
    func play() async
    func pause() async
    func stop() async
    func seek(to seconds: TimeInterval) async
    var currentTime: TimeInterval { get async }
    var duration: TimeInterval { get async }
    /// Desired rate; applies immediately if playing, otherwise on next play.
    func setRate(_ rate: Double) async
    func setVolume(_ volume: Double) async
    func setEventHandler(_ handler: @escaping @Sendable (AudioPlayerEvent) -> Void) async
}

/// Factory plus audio-session lifecycle. Session state is process-wide on
/// Apple platforms, so it lives here rather than on individual players.
public protocol AudioPlayerFactory: Sendable {
    func makePlayer(profile: AudioPlaybackProfile) -> any AudioPlaying
    /// Activates the platform audio session for playback. `longForm` selects
    /// the long-form route policy where the platform distinguishes (watchOS).
    func prepareSession(longForm: Bool) async throws
    func deactivateSession() async
}
