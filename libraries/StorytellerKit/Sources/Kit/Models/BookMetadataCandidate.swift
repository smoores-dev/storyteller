import Foundation

public struct BookMetadataContributor: Sendable, Encodable {
    public let name: String
    public let role: String

    public init(name: String, role: String) {
        self.name = name
        self.role = role
    }
}

public struct BookMetadataSeriesRef: Sendable, Encodable {
    public let name: String
    public let position: Double?
    public let featured: Bool

    public init(name: String, position: Double?, featured: Bool) {
        self.name = name
        self.position = position
        self.featured = featured
    }
}

/// An identifier a provider offers for import, resolved to a concrete server identifier
/// only at save time (type lookup/creation plus format-row scoping happen there).
public struct BookImportedIdentifier: Sendable, Hashable {
    public enum Target: Sendable, Hashable {
        case book, ebook, audiobook
    }

    public let kind: String
    public let typeName: String
    public let value: String
    public let target: Target

    public init(kind: String, typeName: String, value: String, target: Target) {
        self.kind = kind
        self.typeName = typeName
        self.value = value
        self.target = target
    }

    /// Strips hyphens/spaces and applies the web client's ISBN-13 shape check
    /// (13 digits starting 978/979); nil rejects ISBN-10s and junk.
    public static func normalizedISBN13(_ raw: String) -> String? {
        let digits = raw.filter { !$0.isWhitespace && $0 != "-" }
        guard digits.count == 13,
            digits.hasPrefix("978") || digits.hasPrefix("979"),
            digits.allSatisfy(\.isNumber)
        else { return nil }
        return digits
    }
}

/// One provider's answer for a book, in the shape every metadata provider is adapted into so
/// candidates from different providers can be compared and merged field by field. Encoded
/// directly as the Node addon's JSON, so property names are published field names.
public struct BookMetadataCandidate: Sendable, Encodable {
    /// Nil when a candidate is assembled from more than one provider, as the metadata editor does
    /// when a user takes some fields from each column.
    public let provider: BookMetadataProvider?
    public let id: Int?
    public let slug: String?
    public let title: String?
    public let subtitle: String?
    public let description: String?
    public let releaseDate: String?
    public let rating: Double?
    public let language: String?
    public let authors: [String]
    public let narrators: [String]
    public let creators: [BookMetadataContributor]
    public let series: [BookMetadataSeriesRef]
    public let tags: [BookMetadataTag]
    public let defaultAudioEdition: BookEditionCandidate?
    public let editions: [BookEditionCandidate]
    public let imageUrl: String?
    public let imageWidth: Int?
    public let imageHeight: Int?
    public let rawJSON: String?
    /// Client-side import staging only; deliberately kept out of CodingKeys.
    public let importedIdentifiers: [BookImportedIdentifier]

    /// Lists every encoded field so `rawJSON` stays out: it is already-serialized provider JSON and
    /// would go over the wire as an escaped string nested in the record it came from. Adding a field
    /// to this struct means adding it here too, or it silently will not encode.
    private enum CodingKeys: String, CodingKey {
        case provider, id, slug, title, subtitle, description, releaseDate, rating, language
        case authors, narrators, creators, series, tags, defaultAudioEdition, editions
        case imageUrl, imageWidth, imageHeight
    }

    public init(
        provider: BookMetadataProvider? = nil,
        id: Int? = nil,
        slug: String? = nil,
        title: String?,
        subtitle: String?,
        description: String?,
        releaseDate: String?,
        rating: Double?,
        language: String? = nil,
        authors: [String],
        narrators: [String],
        creators: [BookMetadataContributor],
        series: [BookMetadataSeriesRef],
        tags: [BookMetadataTag],
        defaultAudioEdition: BookEditionCandidate? = nil,
        editions: [BookEditionCandidate],
        imageUrl: String? = nil,
        imageWidth: Int? = nil,
        imageHeight: Int? = nil,
        rawJSON: String? = nil,
        importedIdentifiers: [BookImportedIdentifier] = [],
    ) {
        self.provider = provider
        self.id = id
        self.slug = slug
        self.title = title
        self.subtitle = subtitle
        self.description = description
        self.releaseDate = releaseDate
        self.rating = rating
        self.language = language
        self.authors = authors
        self.narrators = narrators
        self.creators = creators
        self.series = series
        self.tags = tags
        self.defaultAudioEdition = defaultAudioEdition
        self.editions = editions
        self.imageUrl = imageUrl
        self.imageWidth = imageWidth
        self.imageHeight = imageHeight
        self.rawJSON = rawJSON
        self.importedIdentifiers = importedIdentifiers
    }
}

public struct BookEditionCandidate: Sendable, Identifiable, Encodable {
    public let id: Int
    public let format: String
    public let editionInfo: String?
    public let title: String?
    public let subtitle: String?
    public let isbn13: String?
    public let isbn10: String?
    public let asin: String?
    public let pages: Int?
    public let audioSeconds: Int?
    public let releaseDate: String?
    public let language: String?
    public let country: String?
    public let publisher: String?
    public let narrators: [String]
    public let otherContributors: [BookMetadataContributor]
    public let imageUrl: String?
    public let imageWidth: Int?
    public let imageHeight: Int?
    public let rawJSON: String?

    /// Excludes `rawJSON` for the same reason `BookMetadataCandidate` does.
    private enum CodingKeys: String, CodingKey {
        case id, format, editionInfo, title, subtitle, isbn13, isbn10, asin, pages, audioSeconds
        case releaseDate, language, country, publisher, narrators, otherContributors
        case imageUrl, imageWidth, imageHeight
    }

    public init(
        id: Int,
        format: String,
        editionInfo: String?,
        title: String?,
        subtitle: String?,
        isbn13: String?,
        isbn10: String?,
        asin: String?,
        pages: Int?,
        audioSeconds: Int?,
        releaseDate: String?,
        language: String?,
        country: String?,
        publisher: String?,
        narrators: [String],
        otherContributors: [BookMetadataContributor],
        imageUrl: String?,
        imageWidth: Int?,
        imageHeight: Int?,
        rawJSON: String?,
    ) {
        self.id = id
        self.format = format
        self.editionInfo = editionInfo
        self.title = title
        self.subtitle = subtitle
        self.isbn13 = isbn13
        self.isbn10 = isbn10
        self.asin = asin
        self.pages = pages
        self.audioSeconds = audioSeconds
        self.releaseDate = releaseDate
        self.language = language
        self.country = country
        self.publisher = publisher
        self.narrators = narrators
        self.otherContributors = otherContributors
        self.imageUrl = imageUrl
        self.imageWidth = imageWidth
        self.imageHeight = imageHeight
        self.rawJSON = rawJSON
    }
}

public struct BookMetadataTag: Sendable, Encodable {
    public let name: String
    public let count: Int
    public let category: String?

    public init(name: String, count: Int, category: String?) {
        self.name = name
        self.count = count
        self.category = category
    }
}

/// A provider's search hit, before its full record is fetched.
public struct BookMetadataSearchResult: Sendable, Identifiable, Encodable {
    public let provider: BookMetadataProvider
    /// The identifier that provider's detail lookup takes: an ASIN for Audnexus, a book id for
    /// Hardcover.
    public let id: String
    public let title: String
    public let subtitle: String?
    public let authors: [String]
    public let narrators: [String]
    public let seriesName: String?
    public let seriesPosition: String?
    public let releaseDate: String?
    public let releaseYear: Int?
    public let imageUrl: String?

    public init(
        provider: BookMetadataProvider,
        id: String,
        title: String,
        subtitle: String? = nil,
        authors: [String] = [],
        narrators: [String] = [],
        seriesName: String? = nil,
        seriesPosition: String? = nil,
        releaseDate: String? = nil,
        releaseYear: Int? = nil,
        imageUrl: String? = nil,
    ) {
        self.provider = provider
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.authors = authors
        self.narrators = narrators
        self.seriesName = seriesName
        self.seriesPosition = seriesPosition
        self.releaseDate = releaseDate
        self.releaseYear = releaseYear
        self.imageUrl = imageUrl
    }
}

public enum BookMetadataProvider: String, Sendable, CaseIterable, Codable {
    case audnexus
    case hardcover

    public var requiresToken: Bool {
        switch self {
            case .audnexus: return false
            case .hardcover: return true
        }
    }
}

extension AudnexusSearchResult {
    public var asMetadataSearchResult: BookMetadataSearchResult {
        BookMetadataSearchResult(
            provider: .audnexus,
            id: asin,
            title: title,
            subtitle: subtitle,
            authors: authors,
            narrators: narrators,
            seriesName: seriesName,
            seriesPosition: seriesPosition,
            releaseDate: releaseDate,
            releaseYear: releaseYear,
            imageUrl: coverUrl,
        )
    }
}

extension HardcoverSearchResult {
    public var asMetadataSearchResult: BookMetadataSearchResult {
        BookMetadataSearchResult(
            provider: .hardcover,
            id: String(id),
            title: title,
            subtitle: subtitle,
            authors: authors,
            seriesName: seriesName,
            seriesPosition: seriesPosition,
            releaseYear: releaseYear,
            imageUrl: imageUrl,
        )
    }
}

extension AudnexusBookDetails {
    /// `creators` is left empty because Audnexus models only authors and narrators; series
    /// `featured` is true only for the primary series.
    public var asMetadataCandidate: BookMetadataCandidate {
        var series: [BookMetadataSeriesRef] = []
        if let primary = seriesPrimary, !primary.name.isEmpty {
            series.append(
                BookMetadataSeriesRef(
                    name: primary.name,
                    position: primary.position.flatMap { Double($0) },
                    featured: true,
                )
            )
        }
        if let secondary = seriesSecondary, !secondary.name.isEmpty {
            series.append(
                BookMetadataSeriesRef(
                    name: secondary.name,
                    position: secondary.position.flatMap { Double($0) },
                    featured: false,
                )
            )
        }

        var identifiers: [BookImportedIdentifier] = []
        if !asin.isEmpty {
            identifiers.append(
                BookImportedIdentifier(
                    kind: "audible",
                    typeName: "Audible ASIN",
                    value: asin,
                    target: .audiobook,
                )
            )
        }
        if let isbn, let normalized = BookImportedIdentifier.normalizedISBN13(isbn) {
            identifiers.append(
                BookImportedIdentifier(
                    kind: "isbn-13",
                    typeName: "ISBN-13",
                    value: normalized,
                    target: .audiobook,
                )
            )
        }

        return BookMetadataCandidate(
            provider: .audnexus,
            title: title,
            subtitle: subtitle,
            description: description,
            releaseDate: releaseDate,
            rating: rating,
            language: language,
            authors: authors,
            narrators: narrators,
            creators: [],
            series: series,
            tags: genres.map { BookMetadataTag(name: $0.name, count: 0, category: $0.type) },
            editions: [],
            imageUrl: imageUrl,
            rawJSON: rawJSON,
            importedIdentifiers: identifiers,
        )
    }
}

extension BookEditionCandidate {
    public var isAudioEdition: Bool {
        audioSeconds != nil || format.localizedCaseInsensitiveContains("audio")
    }

    /// ASINs on audio editions are Audible ASINs; on other editions they are Amazon
    /// (Kindle) ASINs. ISBN-10s are dropped: the server only models isbn-13.
    public var importableIdentifiers: [BookImportedIdentifier] {
        let target: BookImportedIdentifier.Target = isAudioEdition ? .audiobook : .ebook
        var result: [BookImportedIdentifier] = []
        if let isbn13, let normalized = BookImportedIdentifier.normalizedISBN13(isbn13) {
            result.append(
                BookImportedIdentifier(
                    kind: "isbn-13",
                    typeName: "ISBN-13",
                    value: normalized,
                    target: target,
                )
            )
        }
        if let asin, !asin.isEmpty {
            result.append(
                BookImportedIdentifier(
                    kind: isAudioEdition ? "audible" : "asin",
                    typeName: isAudioEdition ? "Audible ASIN" : "ASIN",
                    value: asin,
                    target: target,
                )
            )
        }
        return result
    }
}
