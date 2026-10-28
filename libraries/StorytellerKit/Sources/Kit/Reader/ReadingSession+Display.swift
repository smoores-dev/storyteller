import Foundation

extension ReadingSession {
    /// Current viewport location.
    public var readerLocation: ReaderLocation? {
        navigation.nativeLocation ?? navigation.snapshot?.location
    }
    public var audioState: SMILPlaybackState? { playback.observed }
    public var readerChapterFraction: Double {
        guard let location = readerLocation else { return 0 }
        return location.chapterFraction ?? location.pageIndex.map {
            Double(max(0, $0 - 1)) / Double(max(1, location.totalPages ?? 1))
        } ?? 0
    }
    public var sleepTimerActive: Bool { playback.sleepMode != nil }
    public var sleepTimerRemaining: Double? {
        playback.sleepDeadline.map { max(0, $0.timeIntervalSinceNow) }
    }
    public var sleepTimerType: SleepTimerType? {
        playback.sleepMode.map { $0 == .endOfChapter ? .endOfChapter : .duration }
    }
    public var chapterTimeRemaining: Double? {
        guard let state = audioState, state.playbackRate > 0 else { return nil }
        return max(0, state.chapterTotal - state.chapterElapsed) / state.playbackRate
    }
    public var bookTimeRemaining: Double? {
        guard let state = audioState, state.playbackRate > 0 else { return nil }
        return max(0, state.bookTotal - state.bookElapsed) / state.playbackRate
    }

}
