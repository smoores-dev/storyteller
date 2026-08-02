import Foundation

public struct LiveReadingSyncPacket: Codable, Sendable {
    public let version: Int
    public let senderID: String
    public let bookID: BookID
    public let sectionIndex: Int
    public let entryIndex: Int
    public let textId: String
    public let textHref: String
    public let playbackRate: Double
    public let sentAt: Double

    public init(
        version: Int,
        senderID: String,
        bookID: BookID,
        sectionIndex: Int,
        entryIndex: Int,
        textId: String,
        textHref: String,
        playbackRate: Double,
        sentAt: Double,
    ) {
        self.version = version
        self.senderID = senderID
        self.bookID = bookID
        self.sectionIndex = sectionIndex
        self.entryIndex = entryIndex
        self.textId = textId
        self.textHref = textHref
        self.playbackRate = playbackRate
        self.sentAt = sentAt
    }
}
