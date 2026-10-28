import Foundation

public struct AudiobookSessionChapter: Sendable, Codable, Hashable {
    public let id: String
    public let title: String
    public let duration: TimeInterval

    public init(id: String, title: String, duration: TimeInterval) {
        self.id = id
        self.title = title
        self.duration = duration
    }
}

public struct AudiobookSessionServerPosition: Sendable, Codable, Hashable {
    public let title: String?
    public let totalProgression: Double?

    public init(title: String?, totalProgression: Double?) {
        self.title = title
        self.totalProgression = totalProgression
    }
}

public enum AudiobookSessionSleepTimerMode: String, Sendable, Codable {
    case duration
    case endOfChapter
}

public struct AudiobookSessionState: Sendable, Codable, Hashable {
    public let bookID: String
    public let sourceID: String
    public let title: String
    public let author: String
    public let isPlaying: Bool
    public let currentTime: TimeInterval
    public let duration: TimeInterval
    public let bookProgress: Double
    public let currentChapterID: String?
    public let currentChapterIndex: Int?
    public let chapterElapsed: TimeInterval
    public let chapterDuration: TimeInterval
    public let chapterProgress: Double
    public let playbackRate: Double
    public let volume: Double
    public let chapters: [AudiobookSessionChapter]
    public let sleepTimerMode: AudiobookSessionSleepTimerMode?
    public let sleepTimerRemaining: TimeInterval?
    public let pendingServerPosition: AudiobookSessionServerPosition?
}

public enum AudiobookSessionCommand: Sendable {
    case togglePlayPause
    case skipBackward
    case skipForward
    case previousChapter
    case nextChapter
    case seekChapterFraction(Double)
    case selectChapter(String)
    case setPlaybackRate(Double)
    case setVolume(Double)
    case startSleepTimer(TimeInterval)
    case startEndOfChapterSleepTimer
    case cancelSleepTimer
    case acceptServerPosition
    case declineServerPosition
}

public enum AudiobookSessionError: Error, LocalizedError, Sendable {
    case bookNotFound(String)
    case localMediaUnavailable(String)
    case audiobookNotOpen

    public var errorDescription: String? {
        switch self {
            case .bookNotFound(let id):
                return "Book not found: \(id)"
            case .localMediaUnavailable(let id):
                return "No downloaded audiobook is available for \(id)."
            case .audiobookNotOpen:
                return "No audiobook is open."
        }
    }
}

public enum AudioSessionKind: Sendable, Equatable {
    case audiobook(BookID)
    case readaloud(BookID)

    public var bookID: BookID {
        switch self {
            case .audiobook(let id), .readaloud(let id):
                return id
        }
    }
}

public struct AudioSessionSnapshot: Sendable, Equatable {
    public let kind: AudioSessionKind
    public let title: String?
    public let author: String?
    public let isPlaying: Bool
    public let chapterLabel: String?
    public let bookProgress: Double
    public let playbackRate: Double
}
