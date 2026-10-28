import Foundation

public struct AudioPositionSyncData: Sendable {
    public let sectionIndex: Int
    public let entryIndex: Int
    public let currentTime: Double
    public let audioFile: String
    public let href: String
    public let fragment: String

    public init(
        sectionIndex: Int,
        entryIndex: Int,
        currentTime: Double,
        audioFile: String,
        href: String,
        fragment: String,
    ) {
        self.sectionIndex = sectionIndex
        self.entryIndex = entryIndex
        self.currentTime = currentTime
        self.audioFile = audioFile
        self.href = href
        self.fragment = fragment
    }
}

public enum SMILPlayerError: Error, LocalizedError {
    case noMediaOverlay
    case bookNotLoaded
    case audioLoadFailed(String)
    case invalidPosition
    case playbackUnavailable

    public var errorDescription: String? {
        switch self {
            case .noMediaOverlay:
                return "Book does not contain audio narration"
            case .bookNotLoaded:
                return "No book is currently loaded"
            case .audioLoadFailed(let reason):
                return "Failed to load audio: \(reason)"
            case .invalidPosition:
                return "Invalid playback position"
            case .playbackUnavailable:
                return "Audio playback is unavailable on this platform"
        }
    }
}

public struct SMILPlaybackState: Sendable {
    public let isPlaying: Bool
    public let currentSectionIndex: Int
    public let currentEntryIndex: Int
    public let currentFragment: String
    public let chapterLabel: String?
    public let chapterElapsed: Double
    public let chapterTotal: Double
    public let bookElapsed: Double
    public let bookTotal: Double
    public let playbackRate: Double
    public let volume: Double
    public let bookID: BookID?
    /// Increments on deliberate seeks only.
    public let userSeekCount: Int

    public init(
        isPlaying: Bool,
        currentSectionIndex: Int,
        currentEntryIndex: Int,
        currentFragment: String,
        chapterLabel: String?,
        chapterElapsed: Double,
        chapterTotal: Double,
        bookElapsed: Double,
        bookTotal: Double,
        playbackRate: Double,
        volume: Double,
        bookID: BookID?,
        userSeekCount: Int = 0,
    ) {
        self.isPlaying = isPlaying
        self.currentSectionIndex = currentSectionIndex
        self.currentEntryIndex = currentEntryIndex
        self.currentFragment = currentFragment
        self.chapterLabel = chapterLabel
        self.chapterElapsed = chapterElapsed
        self.chapterTotal = chapterTotal
        self.bookElapsed = bookElapsed
        self.bookTotal = bookTotal
        self.playbackRate = playbackRate
        self.volume = volume
        self.bookID = bookID
        self.userSeekCount = userSeekCount
    }
}
