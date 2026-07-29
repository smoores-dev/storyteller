import Foundation
import StorytellerKit

public enum StorytellerBookLink {
    public static func url(for bookID: BookID) -> URL? {
        var components = URLComponents()
        components.scheme = "storyteller"
        components.host = "book"
        components.queryItems = [
            URLQueryItem(name: "source", value: bookID.sourceID),
            URLQueryItem(name: "uuid", value: bookID.uuid),
        ]
        return components.url
    }

    public static func bookID(from url: URL) -> BookID? {
        guard url.scheme == "storyteller", url.host() == "book",
            let queryItems = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
            let sourceID = queryItems.first(where: { $0.name == "source" })?.value,
            let uuid = queryItems.first(where: { $0.name == "uuid" })?.value
        else { return nil }

        return BookID(sourceID: sourceID, uuid: uuid)
    }

    public static func identifier(for bookID: BookID) -> String? {
        url(for: bookID)?.absoluteString
    }

    public static func bookID(from identifier: String) -> BookID? {
        URL(string: identifier).flatMap(bookID(from:))
    }
}
