import Foundation

public struct NowPlayingInfo: Sendable {
    public var title: String
    public var artist: String?
    public var albumTitle: String?
    public var duration: TimeInterval?
    public var elapsedTime: TimeInterval?
    public var playbackRate: Double
    public var isPlaying: Bool
    /// Encoded image bytes (PNG/JPEG); the platform side decodes.
    public var artwork: Data?

    public init(
        title: String,
        artist: String? = nil,
        albumTitle: String? = nil,
        duration: TimeInterval? = nil,
        elapsedTime: TimeInterval? = nil,
        playbackRate: Double = 1.0,
        isPlaying: Bool = false,
        artwork: Data? = nil,
    ) {
        self.title = title
        self.artist = artist
        self.albumTitle = albumTitle
        self.duration = duration
        self.elapsedTime = elapsedTime
        self.playbackRate = playbackRate
        self.isPlaying = isPlaying
        self.artwork = artwork
    }
}

public struct NowPlayingChapter: Sendable, Equatable {
    public var id: String
    public var title: String
    public var duration: TimeInterval

    public init(id: String, title: String, duration: TimeInterval) {
        self.id = id
        self.title = title
        self.duration = duration
    }
}

public struct NowPlayingChapters: Sendable, Equatable {
    public var currentChapterID: String?
    public var currentChapterIndex: Int?
    public var chapters: [NowPlayingChapter]

    public init(
        currentChapterID: String?,
        currentChapterIndex: Int?,
        chapters: [NowPlayingChapter],
    ) {
        self.currentChapterID = currentChapterID
        self.currentChapterIndex = currentChapterIndex
        self.chapters = chapters
    }
}

public enum RemoteCommand: Sendable {
    case play
    case pause
    case togglePlayPause
    case skipForward(TimeInterval)
    case skipBackward(TimeInterval)
    case changePlaybackPosition(TimeInterval)
    case changePlaybackRate(Double)
    case selectChapter(String)
    case nextChapter
    case previousChapter
    case nextTrack
    case previousTrack
}

public protocol NowPlayingPresenting: Sendable {
    func update(_ info: NowPlayingInfo) async
    func updateChapters(_ chapters: NowPlayingChapters?) async
    func clear() async
    func configureCommands(
        skipForwardInterval: TimeInterval,
        skipBackwardInterval: TimeInterval,
        supportsChangePlaybackPosition: Bool,
        supportsChangePlaybackRate: Bool,
        handler: @escaping @Sendable (RemoteCommand) -> Void,
    ) async
    func teardownCommands() async
}
