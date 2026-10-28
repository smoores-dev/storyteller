import Foundation

public enum AudiobookError: Error, LocalizedError {
    case invalidFileFormat(String)
    case fileNotFound
    case failedToLoadMetadata
    case playbackFailed(String)
    case playbackUnavailable

    public var errorDescription: String? {
        switch self {
            case .invalidFileFormat(let format):
                return
                    "Audiobook format '\(format)' is not supported. Audiobooks must use manifest.json packages."
            case .fileNotFound:
                return "Audiobook file not found at the specified path."
            case .failedToLoadMetadata:
                return "Failed to load audiobook metadata or chapters."
            case .playbackFailed(let reason):
                return "Playback failed: \(reason)"
            case .playbackUnavailable:
                return "Audio playback is not available on this platform."
        }
    }
}

extension Array {
    public subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

public struct AudiobookChapter: Sendable, Hashable {
    public let id: String
    public let title: String
    public let startTime: TimeInterval
    public let duration: TimeInterval
    public let href: String

    public init(
        id: String? = nil,
        title: String,
        startTime: TimeInterval,
        duration: TimeInterval,
        href: String,
    ) {
        self.id = id ?? href
        self.title = title
        self.startTime = startTime
        self.duration = duration
        self.href = href
    }
}

public struct AudiobookTrack: Sendable, Hashable {
    public let href: String
    public let url: URL
    public let type: String?
    public let duration: TimeInterval
    public let startTime: TimeInterval

    public init(
        href: String,
        url: URL,
        type: String?,
        duration: TimeInterval,
        startTime: TimeInterval,
    ) {
        self.href = href
        self.url = url
        self.type = type
        self.duration = duration
        self.startTime = startTime
    }
}

public struct AudiobookMetadata: Sendable {
    public let chapters: [AudiobookChapter]
    public let tracks: [AudiobookTrack]
    public let totalDuration: TimeInterval
    public let title: String?
    public let author: String?

    public init(
        chapters: [AudiobookChapter],
        tracks: [AudiobookTrack] = [],
        totalDuration: TimeInterval,
        title: String?,
        author: String?,
    ) {
        self.chapters = chapters
        self.tracks = tracks
        self.totalDuration = totalDuration
        self.title = title
        self.author = author
    }
}

public struct AudiobookPlaybackState: Sendable {
    public let isPlaying: Bool
    public let currentTime: TimeInterval
    public let duration: TimeInterval
    public let currentChapterIndex: Int?
    public let playbackRate: Float
    public let volume: Float
    public let currentTrackHref: String?
    public let currentTrackType: String?
    public let currentTrackTime: TimeInterval

    public init(
        isPlaying: Bool,
        currentTime: TimeInterval,
        duration: TimeInterval,
        currentChapterIndex: Int?,
        playbackRate: Float,
        volume: Float,
        currentTrackHref: String? = nil,
        currentTrackType: String? = nil,
        currentTrackTime: TimeInterval = 0,
    ) {
        self.isPlaying = isPlaying
        self.currentTime = currentTime
        self.duration = duration
        self.currentChapterIndex = currentChapterIndex
        self.playbackRate = playbackRate
        self.volume = volume
        self.currentTrackHref = currentTrackHref
        self.currentTrackType = currentTrackType
        self.currentTrackTime = currentTrackTime
    }
}
