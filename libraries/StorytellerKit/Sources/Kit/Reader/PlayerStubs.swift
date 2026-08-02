import Foundation

public struct PlaybackProgressUpdateMessage: Codable {
    public let chapterId: String?
    public let chapterLabel: String?
    public let chapterCurrentPage: Int?
    public let chapterTotalPages: Int?
    public let chapterCurrentSecondsAudio: Double?
    public let chapterTotalSecondsAudio: Double?
    public let bookCurrentSecondsAudio: Double?
    public let bookTotalSecondsAudio: Double?
    public let bookCurrentFraction: Double?

    public init(
        chapterId: String? = nil,
        chapterLabel: String? = nil,
        chapterCurrentPage: Int? = nil,
        chapterTotalPages: Int? = nil,
        chapterCurrentSecondsAudio: Double? = nil,
        chapterTotalSecondsAudio: Double? = nil,
        bookCurrentSecondsAudio: Double? = nil,
        bookTotalSecondsAudio: Double? = nil,
        bookCurrentFraction: Double? = nil,
    ) {
        self.chapterId = chapterId
        self.chapterLabel = chapterLabel
        self.chapterCurrentPage = chapterCurrentPage
        self.chapterTotalPages = chapterTotalPages
        self.chapterCurrentSecondsAudio = chapterCurrentSecondsAudio
        self.chapterTotalSecondsAudio = chapterTotalSecondsAudio
        self.bookCurrentSecondsAudio = bookCurrentSecondsAudio
        self.bookTotalSecondsAudio = bookTotalSecondsAudio
        self.bookCurrentFraction = bookCurrentFraction
    }
}

public struct ChapterItem: Codable, Equatable {
    public let id: String
    public let label: String
    public let href: String
    public let level: Int

    public init(id: String, label: String, href: String, level: Int) {
        self.id = id
        self.label = label
        self.href = href
        self.level = level
    }
}

public enum SleepTimerType: String, Codable {
    case duration
    case endOfChapter
}
