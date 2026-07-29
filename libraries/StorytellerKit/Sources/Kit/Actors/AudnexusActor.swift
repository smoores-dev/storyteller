import Foundation

#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct AudnexusSearchResult: Sendable, Identifiable {
    public let asin: String
    public let title: String
    public let subtitle: String?
    public let authors: [String]
    public let narrators: [String]
    public let seriesName: String?
    public let seriesPosition: String?
    public let releaseDate: String?
    public let coverUrl: String?

    public var id: String { asin }

    public var releaseYear: Int? {
        guard let releaseDate, releaseDate.count >= 4 else { return nil }
        return Int(releaseDate.prefix(4))
    }
}

public struct AudnexusGenre: Sendable {
    public let name: String
    /// Audible classifies terms as either "genre" (top-level) or "tag" (finer facets).
    public let type: String
}

public struct AudnexusSeriesRef: Sendable {
    public let name: String
    public let position: String?
}

public struct AudnexusBookDetails: Sendable {
    public let asin: String
    public let title: String?
    public let subtitle: String?
    public let description: String?
    public let authors: [String]
    public let narrators: [String]
    public let seriesPrimary: AudnexusSeriesRef?
    public let seriesSecondary: AudnexusSeriesRef?
    public let genres: [AudnexusGenre]
    public let releaseDate: String?
    public let publisherName: String?
    public let language: String?
    public let rating: Double?
    public let runtimeLengthMin: Int?
    public let isbn: String?
    public let imageUrl: String?
    public let rawJSON: String?
}

/// Audiobook metadata via Audible's public catalog API (search, no key) plus the community
/// Audnexus aggregator (`api.audnex.us`) for the normalized per-book record, which adds typed
/// genres/tags, rating, and full description on top of what the raw catalog search returns.
public actor AudnexusActor {
    public static let shared = AudnexusActor()

    private let audnexusBase = "https://api.audnex.us"

    /// Region controls both the Audible marketplace queried for search and the Audnexus `region`
    /// parameter. Audnexus only knows a fixed set; unknown regions fall back to `us`.
    private func audibleHost(region: String) -> String {
        switch region.lowercased() {
            case "uk": return "https://api.audible.co.uk"
            case "de": return "https://api.audible.de"
            case "fr": return "https://api.audible.fr"
            case "ca": return "https://api.audible.ca"
            case "au": return "https://api.audible.com.au"
            case "it": return "https://api.audible.it"
            case "es": return "https://api.audible.es"
            case "jp": return "https://api.audible.co.jp"
            case "in": return "https://api.audible.in"
            default: return "https://api.audible.com"
        }
    }

    public func searchBooks(
        title: String,
        author: String?,
        region: String = "us",
    ) async throws -> [AudnexusSearchResult] {
        let keywords = [title, author].compactMap { $0 }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        guard !keywords.isEmpty else { return [] }

        let response = try await httpGet(
            "\(audibleHost(region: region))/1.0/catalog/products",
            queryParameters: [
                "keywords": keywords,
                "num_results": "15",
                "products_sort_by": "Relevance",
                "response_groups": "contributors,series,product_desc,media",
            ],
        )

        let decoded = try JSONDecoder().decode(AudibleSearchResponse.self, from: response.data)
        return decoded.products.compactMap { product in
            guard let asin = product.asin, let title = product.title, !title.isEmpty else {
                return nil
            }
            let primarySeries = Self.primarySeries(from: product.series)
            return AudnexusSearchResult(
                asin: asin,
                title: title,
                subtitle: product.subtitle,
                authors: (product.authors ?? []).compactMap { $0.name },
                narrators: (product.narrators ?? []).compactMap { $0.name },
                seriesName: primarySeries?.title,
                seriesPosition: primarySeries?.sequence?.nilIfBlank,
                releaseDate: product.release_date,
                coverUrl: product.product_images?.largest,
            )
        }
    }

    public func fetchBookDetails(
        asin: String,
        region: String = "us",
    ) async throws -> AudnexusBookDetails {
        let response = try await httpGet(
            "\(audnexusBase)/books/\(asin)",
            queryParameters: ["region": region.lowercased()],
        )

        let decoded = try JSONDecoder().decode(AudnexusBookResponse.self, from: response.data)
        return AudnexusBookDetails(
            asin: decoded.asin ?? asin,
            title: decoded.title,
            subtitle: decoded.subtitle,
            // `summary` is the full publisher blurb (HTML); `description` is a truncated plaintext
            // preview that ends mid-sentence. Prefer the full one, falling back only if absent.
            description: decoded.summary ?? decoded.description,
            authors: (decoded.authors ?? []).compactMap { $0.name },
            narrators: (decoded.narrators ?? []).compactMap { $0.name },
            seriesPrimary: decoded.seriesPrimary.map {
                AudnexusSeriesRef(name: $0.name ?? "", position: $0.position?.nilIfBlank)
            },
            seriesSecondary: decoded.seriesSecondary.map {
                AudnexusSeriesRef(name: $0.name ?? "", position: $0.position?.nilIfBlank)
            },
            genres: (decoded.genres ?? []).compactMap { genre in
                guard let name = genre.name else { return nil }
                return AudnexusGenre(name: name, type: genre.type ?? "genre")
            },
            releaseDate: decoded.releaseDate,
            publisherName: decoded.publisherName,
            language: decoded.language,
            rating: decoded.rating.flatMap { Double($0) },
            runtimeLengthMin: decoded.runtimeLengthMin,
            isbn: decoded.isbn,
            imageUrl: decoded.image,
            rawJSON: String(data: response.data, encoding: .utf8),
        )
    }

    private static func primarySeries(from series: [AudibleSeries]?) -> AudibleSeries? {
        guard let series, !series.isEmpty else { return nil }
        // A book may belong to several series (e.g. a saga plus a super-series); the one carrying a
        // sequence number is the meaningful "position 1 of ..." series to prefer.
        return series.first { ($0.sequence?.nilIfBlank) != nil } ?? series.first
    }
}

private struct AudibleSearchResponse: Decodable {
    let products: [AudibleProduct]
}

private struct AudibleProduct: Decodable {
    let asin: String?
    let title: String?
    let subtitle: String?
    let authors: [AudibleContributor]?
    let narrators: [AudibleContributor]?
    let series: [AudibleSeries]?
    let release_date: String?
    let product_images: AudibleProductImages?
}

private struct AudibleContributor: Decodable {
    let name: String?
}

private struct AudibleSeries: Decodable {
    let title: String?
    let sequence: String?
}

private struct AudibleProductImages: Decodable {
    let images: [String: String]

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        images = (try? container.decode([String: String].self)) ?? [:]
    }

    var largest: String? {
        images
            .sorted { (Int($0.key) ?? 0) > (Int($1.key) ?? 0) }
            .first?.value
    }
}

private struct AudnexusBookResponse: Decodable {
    let asin: String?
    let title: String?
    let subtitle: String?
    let description: String?
    let summary: String?
    let authors: [AudnexusPerson]?
    let narrators: [AudnexusPerson]?
    let seriesPrimary: AudnexusSeriesJSON?
    let seriesSecondary: AudnexusSeriesJSON?
    let genres: [AudnexusGenreJSON]?
    let releaseDate: String?
    let publisherName: String?
    let language: String?
    let rating: String?
    let runtimeLengthMin: Int?
    let isbn: String?
    let image: String?
}

private struct AudnexusPerson: Decodable {
    let name: String?
}

private struct AudnexusSeriesJSON: Decodable {
    let name: String?
    let position: String?
}

private struct AudnexusGenreJSON: Decodable {
    let name: String?
    let type: String?
}

extension String {
    fileprivate var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
