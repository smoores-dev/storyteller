import Foundation

public struct ITunesCoverResult: Sendable, Identifiable {
    public let id: String
    public let title: String
    public let artist: String
    public let mediaType: String
    public let thumbnailUrl: URL
    public let artworkUrls: [URL]

    public var hiresUrl: URL {
        artworkUrls.first ?? thumbnailUrl
    }
}

public enum ITunesSearchActor {
    private struct SearchResponse: Decodable {
        let resultCount: Int
        let results: [Result]

        struct Result: Decodable {
            let trackName: String?
            let collectionName: String?
            let artistName: String?
            let artworkUrl100: String?
            let wrapperType: String?
        }
    }

    public static func search(
        title: String,
        author: String?,
    ) async throws -> [ITunesCoverResult] {
        let query = [title, author].compactMap { $0 }.joined(separator: " ")
        guard !query.isEmpty else { return [] }

        async let ebookResults = fetchResults(query: query, entity: "ebook")
        async let audiobookResults = fetchResults(query: query, entity: "audiobook")

        let ebooks = (try? await ebookResults) ?? []
        let audiobooks = (try? await audiobookResults) ?? []
        return ebooks + audiobooks
    }

    private static func fetchResults(
        query: String,
        entity: String,
    ) async throws -> [ITunesCoverResult] {
        let response = try await httpGet(
            "https://itunes.apple.com/search",
            queryParameters: [
                "term": query,
                "country": "us",
                "entity": entity,
                "limit": "25",
            ],
        )

        let decoded = try JSONDecoder().decode(SearchResponse.self, from: response.data)

        return decoded.results.compactMap { result in
            guard let artworkUrl100 = result.artworkUrl100 else { return nil }

            let title = result.trackName ?? result.collectionName ?? "Unknown"
            let artist = result.artistName ?? ""

            let artworkUrls = artworkUrlCandidates(from: artworkUrl100)
            guard let thumbnailUrl = artworkUrls.last else { return nil }

            return ITunesCoverResult(
                id: "\(entity)-\(artworkUrl100)",
                title: title,
                artist: artist,
                mediaType: entity,
                thumbnailUrl: thumbnailUrl,
                artworkUrls: artworkUrls,
            )
        }
    }

    private static func artworkUrlCandidates(from artworkUrl100: String) -> [URL] {
        let sizes = ["2000x2000bb", "1200x1200bb", "600x600bb"]
        var seen = Set<String>()
        var urls: [URL] = []

        for size in sizes {
            let candidate =
                artworkUrl100
                .replacingOccurrences(of: "100x100bb", with: size)
                .replacingOccurrences(of: "100x100", with: String(size.dropLast(2)))
            guard seen.insert(candidate).inserted, let url = URL(string: candidate) else {
                continue
            }
            urls.append(url)
        }

        return urls
    }
}
