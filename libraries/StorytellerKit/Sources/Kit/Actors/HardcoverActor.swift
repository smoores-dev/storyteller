import Foundation

#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct HardcoverSearchResult: Sendable, Identifiable {
    public let id: Int
    public let title: String
    public let subtitle: String?
    public let authors: [String]
    public let seriesName: String?
    public let seriesPosition: String?
    public let releaseYear: Int?
    public let imageUrl: String?
}

public actor HardcoverActor {
    public static let shared = HardcoverActor()

    private let endpoint = "https://api.hardcover.app/v1/graphql"
    private var token: String?
    private let urlSession: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 30
        urlSession = URLSession(configuration: config)
    }

    public func setToken(_ token: String?) {
        let trimmed = token?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.token = (trimmed?.isEmpty == false) ? trimmed : nil
    }

    public var hasToken: Bool { token != nil }

    public func searchBooks(query: String) async throws -> [HardcoverSearchResult] {
        guard let token else { throw HardcoverError.noToken }

        let graphQL: [String: Any] = [
            "query": """
            query SearchBooks($q: String!) {
                search(query: $q, query_type: "Book", per_page: 10) {
                    results
                }
            }
            """,
            "variables": ["q": query],
        ]

        let body = try JSONSerialization.data(withJSONObject: graphQL)
        let responseData = try await postGraphQL(body: body, token: token)

        guard let json = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
            let data = json["data"] as? [String: Any],
            let search = data["search"] as? [String: Any]
        else {
            throw HardcoverError.invalidResponse
        }

        let hits: [[String: Any]]
        if let resultsRaw = search["results"] {
            let resultsObj: [String: Any]
            if let resultsString = resultsRaw as? String,
                let parsed = try? JSONSerialization.jsonObject(
                    with: Data(resultsString.utf8)
                ) as? [String: Any]
            {
                resultsObj = parsed
            } else if let dict = resultsRaw as? [String: Any] {
                resultsObj = dict
            } else {
                throw HardcoverError.graphQLError(
                    "Unexpected results format: \(type(of: resultsRaw))"
                )
            }
            hits = resultsObj["hits"] as? [[String: Any]] ?? []
        } else {
            hits = []
        }

        return hits.compactMap { hit in
            guard let doc = hit["document"] as? [String: Any],
                let title = doc["title"] as? String
            else { return nil }

            let id: Int
            if let intId = doc["id"] as? Int {
                id = intId
            } else if let strId = doc["id"] as? String, let parsed = Int(strId) {
                id = parsed
            } else {
                return nil
            }

            let authors = doc["author_names"] as? [String] ?? []
            let releaseYear = doc["release_year"] as? Int
            let featuredSeries = doc["featured_series"] as? [String: Any]
            let seriesName =
                featuredSeries?["series_name"] as? String
                ?? (featuredSeries?["series"] as? [String: Any])?["name"] as? String
                ?? (doc["series_names"] as? [String])?.first
            let seriesPosition = (featuredSeries?["position"] ?? doc["featured_series_position"])
                .flatMap { pos -> String? in
                    if let n = pos as? Int { return String(n) }
                    if let d = pos as? Double { return String(d) }
                    return pos as? String
                }
            let imageUrl =
                (doc["image"] as? [String: Any])?["url"] as? String
                ?? doc["image"] as? String

            return HardcoverSearchResult(
                id: id,
                title: title,
                subtitle: doc["subtitle"] as? String,
                authors: authors,
                seriesName: seriesName,
                seriesPosition: seriesPosition,
                releaseYear: releaseYear,
                imageUrl: imageUrl,
            )
        }
    }

    public func fetchBookDetails(id: Int) async throws -> BookMetadataCandidate {
        guard let token else { throw HardcoverError.noToken }

        let graphQL: [String: Any] = [
            "query": """
            query GetBook($id: Int!) {
                books(where: {id: {_eq: $id}}) {
                    id
                    slug
                    title
                    subtitle
                    description
                    release_date
                    release_year
                    rating
                    cached_contributors
                    cached_featured_series
                    cached_image
                    cached_tags
                    book_mappings {
                        external_id
                        edition_id
                        state
                        verified
                        loaded
                        platform { name url }
                    }
                    contributions {
                        contribution
                        author { name }
                    }
                    book_series {
                        position
                        featured
                        series { name }
                    }
                    taggable_counts(order_by: {count: desc}) {
                        count
                        tag {
                            tag
                            tag_category { category slug }
                        }
                    }
                    image { url width height }
                    default_audio_edition {
                        id
                        object_type
                        source
                        state
                        score
                        edition_format
                        edition_information
                        physical_format
                        physical_information
                        title
                        subtitle
                        isbn_13
                        isbn_10
                        asin
                        pages
                        audio_seconds
                        release_date
                        release_year
                        rating
                        cached_contributors
                        cached_image
                        cached_tags
                        language { language }
                        country { name }
                        publisher { name }
                        image { url width height }
                        images { url width height }
                        book_mappings {
                            external_id
                            edition_id
                            state
                            verified
                            loaded
                            platform { name url }
                        }
                        contributions {
                            contribution
                            author { name }
                        }
                    }
                    editions {
                        id
                        object_type
                        source
                        state
                        score
                        edition_format
                        edition_information
                        physical_format
                        physical_information
                        title
                        subtitle
                        isbn_13
                        isbn_10
                        asin
                        pages
                        audio_seconds
                        release_date
                        release_year
                        rating
                        cached_contributors
                        cached_image
                        cached_tags
                        language { language }
                        country { name }
                        publisher { name }
                        image { url width height }
                        images { url width height }
                        book_mappings {
                            external_id
                            edition_id
                            state
                            verified
                            loaded
                            platform { name url }
                        }
                        contributions {
                            contribution
                            author { name }
                        }
                    }
                }
            }
            """,
            "variables": ["id": id],
        ]

        let body = try JSONSerialization.data(withJSONObject: graphQL)
        let responseData = try await postGraphQL(body: body, token: token)

        guard let json = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
            let data = json["data"] as? [String: Any],
            let books = data["books"] as? [[String: Any]],
            let book = books.first
        else { throw HardcoverError.bookNotFound }

        let rawJSON = Self.prettyJSONString(book)
        let slug = book["slug"] as? String
        let title = book["title"] as? String
        let subtitle = book["subtitle"] as? String
        let description = book["description"] as? String
        let releaseDate: String? = {
            guard let raw = book["release_date"] as? String else { return nil }
            if let date = StorytellerDate.parse(raw, field: .releaseDate) {
                return StorytellerDate.isoFull(from: date)
            }
            return raw
        }()
        let rating = book["rating"] as? Double
        let bookImage = book["image"] as? [String: Any]
        let bookImageUrl = bookImage?["url"] as? String
        let bookImageWidth = bookImage?["width"] as? Int
        let bookImageHeight = bookImage?["height"] as? Int

        let contributions = book["contributions"] as? [[String: Any]] ?? []
        var authors: [String] = []
        var creators: [BookMetadataContributor] = []

        for contrib in contributions {
            guard let author = contrib["author"] as? [String: Any],
                let name = author["name"] as? String
            else { continue }
            let role = contrib["contribution"] as? String ?? ""
            if role.lowercased() == "author" || role.isEmpty {
                authors.append(name)
            } else {
                creators.append(BookMetadataContributor(name: name, role: role))
            }
        }

        let defaultAudioEdition = (book["default_audio_edition"] as? [String: Any])
            .flatMap(Self.parseEdition)
        let narrators = defaultAudioEdition?.narrators ?? []

        let bookSeries = book["book_series"] as? [[String: Any]] ?? []
        let series: [BookMetadataSeriesRef] = bookSeries.compactMap { bs in
            guard let seriesObj = bs["series"] as? [String: Any],
                let name = seriesObj["name"] as? String
            else { return nil }
            let position = bs["position"] as? Double
            let featured = bs["featured"] as? Bool ?? false
            return BookMetadataSeriesRef(name: name, position: position, featured: featured)
        }

        let taggableCounts = book["taggable_counts"] as? [[String: Any]] ?? []
        let tags: [BookMetadataTag] = taggableCounts.compactMap { tc in
            guard let tag = tc["tag"] as? [String: Any],
                let name = tag["tag"] as? String
            else { return nil }
            let count = tc["count"] as? Int ?? 0
            let category = (tag["tag_category"] as? [String: Any])?["category"] as? String
            return BookMetadataTag(name: name, count: count, category: category)
        }

        let editionsRaw = book["editions"] as? [[String: Any]] ?? []
        let editions: [BookEditionCandidate] = editionsRaw.compactMap(Self.parseEdition)

        return BookMetadataCandidate(
            provider: .hardcover,
            id: id,
            slug: slug,
            title: title,
            subtitle: subtitle,
            description: description,
            releaseDate: releaseDate,
            rating: rating,
            authors: authors,
            narrators: narrators,
            creators: creators,
            series: series,
            tags: tags,
            defaultAudioEdition: defaultAudioEdition,
            editions: editions,
            imageUrl: bookImageUrl,
            imageWidth: bookImageWidth,
            imageHeight: bookImageHeight,
            rawJSON: rawJSON,
        )
    }

    private static func parseEdition(_ ed: [String: Any]) -> BookEditionCandidate? {
        guard let format = ed["edition_format"] as? String,
            let edId = ed["id"] as? Int
        else { return nil }
        let lang = (ed["language"] as? [String: Any])?["language"] as? String
        let country = (ed["country"] as? [String: Any])?["name"] as? String
        let publisher = (ed["publisher"] as? [String: Any])?["name"] as? String
        let edImage = ed["image"] as? [String: Any]
        let edImageUrl = edImage?["url"] as? String
        let edImageWidth = edImage?["width"] as? Int
        let edImageHeight = edImage?["height"] as? Int
        let rawEditionJSON = Self.prettyJSONString(ed)
        let edContribs = ed["contributions"] as? [[String: Any]] ?? []
        var edNarrators: [String] = []
        var edOther: [BookMetadataContributor] = []
        for c in edContribs {
            guard let a = c["author"] as? [String: Any],
                let name = a["name"] as? String
            else { continue }
            let role = c["contribution"] as? String ?? ""
            if role.lowercased() == "narrator" {
                edNarrators.append(name)
            } else if !role.isEmpty && role.lowercased() != "author" {
                edOther.append(BookMetadataContributor(name: name, role: role))
            }
        }
        return BookEditionCandidate(
            id: edId,
            format: format,
            editionInfo: ed["edition_information"] as? String,
            title: ed["title"] as? String,
            subtitle: ed["subtitle"] as? String,
            isbn13: ed["isbn_13"] as? String,
            isbn10: ed["isbn_10"] as? String,
            asin: ed["asin"] as? String,
            pages: ed["pages"] as? Int,
            audioSeconds: ed["audio_seconds"] as? Int,
            releaseDate: ed["release_date"] as? String,
            language: lang,
            country: country,
            publisher: publisher,
            narrators: edNarrators,
            otherContributors: edOther,
            imageUrl: edImageUrl,
            imageWidth: edImageWidth,
            imageHeight: edImageHeight,
            rawJSON: rawEditionJSON,
        )
    }

    private static func prettyJSONString(_ object: Any) -> String? {
        guard JSONSerialization.isValidJSONObject(object),
            let data = try? JSONSerialization.data(
                withJSONObject: object,
                options: [.prettyPrinted, .sortedKeys],
            )
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func postGraphQL(body: Data, token: String) async throws -> Data {
        guard let url = URL(string: endpoint) else { throw HardcoverError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let auth = token.hasPrefix("Bearer ") ? token : "Bearer \(token)"
        request.setValue(auth, forHTTPHeaderField: "Authorization")
        request.httpBody = body

        let (data, response) = try await urlSession.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw HardcoverError.invalidResponse
        }

        switch httpResponse.statusCode {
            case 200..<300: break
            case 401: throw HardcoverError.unauthorized
            case 429: throw HardcoverError.rateLimited
            default: throw HardcoverError.unexpectedStatus(httpResponse.statusCode)
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let errors = json["errors"] as? [[String: Any]], let first = errors.first {
                let message = first["message"] as? String ?? "Unknown GraphQL error"
                throw HardcoverError.graphQLError(message)
            }
            if let error = json["error"] as? String {
                throw HardcoverError.graphQLError(error)
            }
        }

        return data
    }
}

public enum HardcoverError: Error, LocalizedError {
    case noToken
    case invalidURL
    case invalidResponse
    case unauthorized
    case rateLimited
    case bookNotFound
    case invalidBookID(String)
    case unexpectedStatus(Int)
    case graphQLError(String)

    public var errorDescription: String? {
        switch self {
            case .noToken: return "No Hardcover API token configured"
            case .invalidURL: return "Invalid API URL"
            case .invalidResponse: return "Invalid response from server"
            case .unauthorized: return "Invalid or expired Hardcover token"
            case .rateLimited: return "Rate limited - try again in a minute"
            case .bookNotFound: return "Book not found on Hardcover"
            case .invalidBookID(let id): return "Not a Hardcover book id: \(id)"
            case .unexpectedStatus(let code): return "Unexpected HTTP status: \(code)"
            case .graphQLError(let msg): return "Hardcover: \(msg)"
        }
    }
}
