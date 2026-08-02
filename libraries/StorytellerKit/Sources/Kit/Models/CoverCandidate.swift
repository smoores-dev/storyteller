import Foundation

public enum CoverProvider: String, Sendable, CaseIterable, Identifiable, Codable {
    case apple
    case hardcover

    public var id: String { rawValue }

    public var requiresToken: Bool {
        switch self {
            case .apple: return false
            case .hardcover: return true
        }
    }
}

/// Which of a book's two cover slots a candidate belongs to. Providers describe formats in their
/// own vocabulary, so each adapter decides this rather than leaving it to callers.
public enum CoverMediaKind: String, Sendable, Encodable {
    case audiobook
    case ebook
}

/// One cover image a provider offers, in the shape every provider is adapted into. Encoded
/// directly as the Node addon's JSON, so property names are published field names.
public struct CoverCandidate: Sendable, Identifiable, Hashable, Encodable {
    public let id: String
    public let provider: CoverProvider
    public let mediaKind: CoverMediaKind
    public let url: URL
    public let title: String
    public let subtitle: String?
    public let width: Int?
    public let height: Int?
    public let language: String?
    public let format: String?

    public init(
        id: String,
        provider: CoverProvider,
        mediaKind: CoverMediaKind,
        url: URL,
        title: String,
        subtitle: String?,
        width: Int?,
        height: Int?,
        language: String?,
        format: String?,
    ) {
        self.id = id
        self.provider = provider
        self.mediaKind = mediaKind
        self.url = url
        self.title = title
        self.subtitle = subtitle
        self.width = width
        self.height = height
        self.language = language
        self.format = format
    }

    public var filename: String {
        let ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
        return "\(provider.rawValue)-\(mediaKind.rawValue)-cover.\(ext)"
    }
}

public enum CoverSearch {
    public static func apple(title: String, author: String?) async throws -> [CoverCandidate] {
        let results = try await ITunesSearchActor.search(title: title, author: author)
        return dedupedByURL(
            results.map { result in
                let resolution = inferredResolution(from: result.hiresUrl)
                return CoverCandidate(
                    id: "apple-\(result.id)",
                    provider: .apple,
                    mediaKind: result.mediaType == "audiobook" ? .audiobook : .ebook,
                    url: result.hiresUrl,
                    title: result.title,
                    subtitle: result.artist,
                    width: resolution?.width,
                    height: resolution?.height,
                    language: nil,
                    format: result.mediaType,
                )
            }
        )
    }

    public static func hardcover(
        title: String,
        author: String?,
        limit: Int = 6,
    ) async throws -> [CoverCandidate] {
        let query = [title, author].compactMap { $0 }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        guard !query.isEmpty else { return [] }

        let results = try await HardcoverActor.shared.searchBooks(query: query)
        var candidates: [CoverCandidate] = []
        for result in results.prefix(limit) {
            let details = try await HardcoverActor.shared.fetchBookDetails(id: result.id)
            candidates += self.candidates(from: details, fallbackTitle: result.title)
        }
        return dedupedByURL(candidates)
    }

    public static func candidates(
        from details: BookMetadataCandidate,
        fallbackTitle: String,
    ) -> [CoverCandidate] {
        var candidates: [CoverCandidate] = []

        if let url = details.imageUrl.flatMap(URL.init(string:)) {
            candidates.append(
                CoverCandidate(
                    id: "hardcover-work-\(details.id.map(String.init) ?? url.absoluteString)",
                    provider: .hardcover,
                    mediaKind: .ebook,
                    url: url,
                    title: details.title ?? fallbackTitle,
                    subtitle: "Work cover",
                    width: details.imageWidth,
                    height: details.imageHeight,
                    language: nil,
                    format: "Work cover",
                )
            )
        }

        let editions = [details.defaultAudioEdition].compactMap { $0 } + details.editions
        for edition in editions {
            guard let url = edition.imageUrl.flatMap(URL.init(string:)) else { continue }
            candidates.append(
                CoverCandidate(
                    id: "hardcover-edition-\(edition.id)",
                    provider: .hardcover,
                    mediaKind: isAudioEdition(edition) ? .audiobook : .ebook,
                    url: url,
                    title: edition.title ?? details.title ?? fallbackTitle,
                    subtitle: editionSubtitle(edition),
                    width: edition.imageWidth,
                    height: edition.imageHeight,
                    language: edition.language,
                    format: normalizedFormat(edition.format),
                )
            )
        }

        return dedupedByURL(candidates)
    }

    public static func isAudioEdition(_ edition: BookEditionCandidate) -> Bool {
        let format = edition.format.lowercased()
        return format.contains("audio") || edition.audioSeconds != nil || !edition.narrators.isEmpty
    }

    private static let formatNormalization: [String: String] = [
        "ebook": "Ebook", "e-book": "Ebook", "kindle": "Kindle", "epub3": "Ebook",
        "audible": "Audible", "audiobook": "Audiobook", "unabridged audiobook": "Audiobook",
        "hardcover": "Hardcover", "paperback": "Paperback",
        "mass market paperback": "Mass Market Paperback",
    ]

    public static func normalizedFormat(_ format: String) -> String {
        formatNormalization[format.lowercased()]
            ?? {
                guard let first = format.first else { return format }
                return String(first).uppercased() + format.dropFirst()
            }()
    }

    public static func editionSubtitle(_ edition: BookEditionCandidate) -> String {
        [
            edition.editionInfo,
            edition.format.isEmpty ? nil : edition.format,
            edition.releaseDate.map { $0.contains("T") ? String($0.prefix(10)) : $0 },
        ]
        .compactMap { $0 }
        .joined(separator: " / ")
    }

    /// Apple encodes the artwork size in a path component (`.../2000x2000bb.jpg`), so a candidate's
    /// resolution can be read off the URL without fetching the bytes.
    public static func inferredResolution(from url: URL) -> (width: Int, height: Int)? {
        for component in url.pathComponents.reversed() {
            let pieces = component.split(separator: "x", maxSplits: 1)
            guard pieces.count == 2 else { continue }
            let widthText = pieces[0].filter(\.isNumber)
            let heightText = pieces[1].prefix { $0.isNumber }
            if let width = Int(widthText), let height = Int(heightText) {
                return (width, height)
            }
        }
        return nil
    }

    public static func dedupedByURL(_ candidates: [CoverCandidate]) -> [CoverCandidate] {
        var seen = Set<URL>()
        return candidates.filter { seen.insert($0.url).inserted }
    }
}
