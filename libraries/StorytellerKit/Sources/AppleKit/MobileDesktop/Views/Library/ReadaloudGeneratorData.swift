#if os(iOS) || os(macOS)
import Foundation
import StorytellerKit

extension Notification.Name {
    public static let storytellerCreateReadaloud = Notification.Name("storytellerCreateReadaloud")
}

public enum ReadaloudGeneratorDestination: String, Codable, Hashable, Sendable {
    case file
    case source
}

public struct ReadaloudGeneratorData: Codable, Hashable, Sendable, Identifiable {
    public var id: UUID { requestID }
    public let requestID: UUID
    public let bookID: BookID
    public let bookTitle: String
    public let sourceName: String
    public let sourceKind: BookSourceKind?
    public let destination: ReadaloudGeneratorDestination
    public let ebookURL: URL?
    public let audioURLs: [URL]

    public init(
        bookID: BookID,
        bookTitle: String,
        sourceName: String,
        sourceKind: BookSourceKind?,
        destination: ReadaloudGeneratorDestination,
        ebookURL: URL?,
        audioURLs: [URL],
    ) {
        self.requestID = UUID()
        self.bookID = bookID
        self.bookTitle = bookTitle
        self.sourceName = sourceName
        self.sourceKind = sourceKind
        self.destination = destination
        self.ebookURL = ebookURL
        self.audioURLs = audioURLs
    }

    public init(
        bookID: BookID,
        bookTitle: String,
        sourceName: String,
        sourceKind: BookSourceKind?,
        destination: ReadaloudGeneratorDestination,
        ebookURL: URL?,
        audioURL: URL?,
    ) {
        self.init(
            bookID: bookID,
            bookTitle: bookTitle,
            sourceName: sourceName,
            sourceKind: sourceKind,
            destination: destination,
            ebookURL: ebookURL,
            audioURLs: audioURL.map { [$0] } ?? [],
        )
    }

}

#endif
