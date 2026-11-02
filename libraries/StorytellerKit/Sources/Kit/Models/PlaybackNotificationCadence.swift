import Foundation

/// Publishes playback when displayed seconds or timeline position change.
/// Explicit commands always publish.
struct PlaybackNotificationCadence {
    private struct Display: Equatable {
        let span: Int
        let chapter: Int?
        let mediaElapsed: Double
        let mediaRemaining: Double
        let elapsed: Double
        let remaining: Double
    }

    private var lastDisplay: Display?

    mutating func shouldNotify(
        _ state: SMILPlaybackState,
        span: Int,
        chapter: Int?,
        force: Bool = false,
    ) -> Bool {
        // Match the whole-second rounding used by the playback labels. Some
        // show media time; others show listening time adjusted for playback speed.
        let display = Display(
            span: span,
            chapter: chapter,
            mediaElapsed: max(0, state.chapterElapsed).rounded(),
            mediaRemaining: max(0, state.chapterTotal - state.chapterElapsed).rounded(),
            elapsed: max(0, state.chapterElapsed / state.playbackRate).rounded(),
            remaining: max(0, (state.chapterTotal - state.chapterElapsed) / state.playbackRate)
                .rounded(),
        )
        guard force || display != lastDisplay else { return false }
        lastDisplay = display
        return true
    }
}
