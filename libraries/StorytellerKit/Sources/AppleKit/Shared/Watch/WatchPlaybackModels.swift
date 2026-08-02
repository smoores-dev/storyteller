import Foundation
import StorytellerKit

public struct RemotePlaybackState: Codable, Hashable, Sendable {
    public let bookTitle: String
    public let bookID: BookID
    public let chapterTitle: String
    public let currentChapterIndex: Int
    public let chapters: [RemoteChapter]
    public let isPlaying: Bool
    public let chapterElapsed: TimeInterval
    public let chapterDuration: TimeInterval
    public let bookElapsed: TimeInterval
    public let bookDuration: TimeInterval
    public let playbackRate: Double
    public let volume: Double

    public init(
        bookTitle: String,
        bookID: BookID,
        chapterTitle: String,
        currentChapterIndex: Int,
        chapters: [RemoteChapter],
        isPlaying: Bool,
        chapterElapsed: TimeInterval,
        chapterDuration: TimeInterval,
        bookElapsed: TimeInterval,
        bookDuration: TimeInterval,
        playbackRate: Double,
        volume: Double,
    ) {
        self.bookTitle = bookTitle
        self.bookID = bookID
        self.chapterTitle = chapterTitle
        self.currentChapterIndex = currentChapterIndex
        self.chapters = chapters
        self.isPlaying = isPlaying
        self.chapterElapsed = chapterElapsed
        self.chapterDuration = chapterDuration
        self.bookElapsed = bookElapsed
        self.bookDuration = bookDuration
        self.playbackRate = playbackRate
        self.volume = volume
    }
}

public struct RemoteChapter: Codable, Hashable, Sendable {
    public let index: Int
    public let title: String
    public let sectionIndex: Int

    public init(index: Int, title: String, sectionIndex: Int) {
        self.index = index
        self.title = title
        self.sectionIndex = sectionIndex
    }
}

public enum RemotePlaybackCommand: Codable, Hashable, Sendable {
    case togglePlayPause
    case skipForward
    case skipBackward
    case seekToChapter(sectionIndex: Int)
    case setPlaybackRate(rate: Double)
    case setVolume(volume: Double)
}
