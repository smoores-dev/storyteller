import Foundation

/// Tracks when playback was paused so a resume can step back a few seconds.
/// A short pause counts as an interruption, a long one as a break, and the two
/// get separate rewind amounts.
public struct AutomaticRewind: Sendable {
    private var lastPaused: Date?

    public init() {}

    public mutating func recordPause(at date: Date = Date()) {
        lastPaused = date
    }

    public mutating func reset() {
        lastPaused = nil
    }

    /// Seconds to rewind before resuming; consumes the recorded pause.
    public mutating func secondsOnResume(
        config: StorytellerGlobalConfig.Playback,
        now: Date = Date(),
    ) -> Double {
        defer { lastPaused = nil }
        guard config.automaticRewindEnabled, let lastPaused else { return 0 }
        let pausedFor = now.timeIntervalSince(lastPaused)
        guard pausedFor > 0 else { return 0 }
        return pausedFor < kAutomaticRewindBreakThreshold
            ? config.automaticRewindAfterInterruption
            : config.automaticRewindAfterBreak
    }
}
