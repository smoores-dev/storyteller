import Foundation

/// One identifier attached to a book (ISBN, ASIN, DOI, ...): the identifier type's
/// fields joined onto the value, as it rides on the book payload and
/// `GET /books/{bookId}/identifiers`. The wire key `uuid` is the TYPE's uuid, mapped
/// to `typeUuid` here so call sites can't mistake it for a per-relation id.
public struct BookIdentifier: Codable, Hashable, Sendable {
    /// Kinds the server assigns to its built-in types; custom types have a nil kind.
    public static let knownKinds: Set<String> = [
        "doi", "asin", "audible", "isbn-13", "hardcover-edition-id", "hardcover-book-slug",
    ]

    public let typeUuid: String
    public let kind: String?
    public let name: String
    public let urlTemplate: String?
    public let value: String

    public init(
        typeUuid: String,
        kind: String?,
        name: String,
        urlTemplate: String?,
        value: String,
    ) {
        self.typeUuid = typeUuid
        self.kind = kind
        self.name = name
        self.urlTemplate = urlTemplate
        self.value = value
    }

    private enum CodingKeys: String, CodingKey {
        case typeUuid = "uuid"
        case kind, name, urlTemplate, value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        typeUuid = container.decodeLenient(String.self, forKey: .typeUuid) ?? ""
        kind = container.decodeLenient(String.self, forKey: .kind)
        name = container.decodeLenient(String.self, forKey: .name) ?? ""
        urlTemplate = container.decodeLenient(String.self, forKey: .urlTemplate)
        value = container.decodeLenient(String.self, forKey: .value) ?? ""
    }

    /// The web client's per-kind display names; custom types show their type name.
    public static func displayName(kind: String?, typeName: String) -> String {
        switch kind {
            case "doi": return "DOI"
            case "asin": return "ASIN"
            case "audible": return "Audible ASIN"
            case "isbn-13": return "ISBN-13"
            case "hardcover-book-slug": return "Hardcover Book Slug"
            case "hardcover-edition-id": return "Hardcover Edition ID"
            default: return typeName
        }
    }

    public var displayName: String { Self.displayName(kind: kind, typeName: name) }

    /// The web client's per-kind links (`identifierKinds.ts`), with one app-specific
    /// twist: audiobook-scoped ISBNs link to Libro.FM instead of isbnsearch.org.
    /// Custom types fall back to their `urlTemplate`.
    public func resolvedURL(audiobookScoped: Bool = false, hardcoverSlug: String? = nil) -> URL? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        switch kind {
            case "doi":
                return URL(string: "https://doi.org/" + Self.encodeURI(trimmed))
            case "asin":
                return URL(string: "https://www.amazon.com/dp/" + Self.encodeURIComponent(trimmed))
            case "audible":
                return URL(string: "https://www.audible.com/pd/" + Self.encodeURIComponent(trimmed))
            case "isbn-13":
                let digits = trimmed.replacingOccurrences(
                    of: "[-\\s]", with: "", options: .regularExpression)
                return URL(
                    string: audiobookScoped
                        ? "https://libro.fm/audiobooks/" + digits
                        : "https://isbnsearch.org/isbn/" + digits)
            case "hardcover-book-slug":
                return URL(string: "https://hardcover.app/books/" + Self.encodeURIComponent(trimmed))
            case "hardcover-edition-id":
                guard let slug = hardcoverSlug?.trimmingCharacters(in: .whitespacesAndNewlines),
                    !slug.isEmpty
                else { return nil }
                return URL(
                    string: "https://hardcover.app/books/\(Self.encodeURIComponent(slug))"
                        + "/editions/\(Self.encodeURIComponent(trimmed))")
            default:
                guard let urlTemplate, !urlTemplate.isEmpty else { return nil }
                var urlString = urlTemplate
                if let range = urlString.range(of: "{value}") {
                    urlString.replaceSubrange(range, with: Self.encodeURIComponent(value))
                }
                return URL(string: urlString)
        }
    }

    /// JavaScript `encodeURIComponent` semantics (unreserved marks stay literal).
    static func encodeURIComponent(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.!~*'()")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    /// JavaScript `encodeURI` semantics (URL structure characters stay literal).
    static func encodeURI(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.!~*'();/?:@&=+$,#")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }
}

/// A merged display row: the identifier plus its resolved external link, which
/// depends on scope (Libro.FM) and siblings (Hardcover edition links).
public struct BookDisplayIdentifier: Hashable, Sendable {
    public let identifier: BookIdentifier
    public let url: URL?
    public let audiobookScoped: Bool

    public init(identifier: BookIdentifier, url: URL?, audiobookScoped: Bool) {
        self.identifier = identifier
        self.url = url
        self.audiobookScoped = audiobookScoped
    }
}

/// A row from `GET /identifiers`. `kind` is server-assigned only; POST bodies never
/// carry it.
public struct IdentifierType: Codable, Hashable, Sendable, Identifiable {
    public let uuid: String
    public let name: String
    public let kind: String?
    public let urlTemplate: String?

    public var id: String { uuid }

    public init(uuid: String, name: String, kind: String? = nil, urlTemplate: String? = nil) {
        self.uuid = uuid
        self.name = name
        self.kind = kind
        self.urlTemplate = urlTemplate
    }

    private enum CodingKeys: String, CodingKey {
        case uuid, name, kind, urlTemplate
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        uuid = try container.decode(String.self, forKey: .uuid)
        name = container.decodeLenient(String.self, forKey: .name) ?? ""
        kind = container.decodeLenient(String.self, forKey: .kind)
        urlTemplate = container.decodeLenient(String.self, forKey: .urlTemplate)
    }

    public var displayName: String { BookIdentifier.displayName(kind: kind, typeName: name) }
}

/// A row from `GET /books/{bookId}/identifiers`: the raw identifier relation, NOT the
/// joined type shape the book payload carries. The row's own `uuid` (the relation id)
/// is ignored; format-linked rows come from the server's file metadata extraction.
public struct BookIdentifierRelation: Codable, Hashable, Sendable {
    public let identifierTypeUuid: String
    public let value: String
    public let ebookUuid: String?
    public let audiobookUuid: String?
    public let readaloudUuid: String?

    public init(
        identifierTypeUuid: String,
        value: String,
        ebookUuid: String? = nil,
        audiobookUuid: String? = nil,
        readaloudUuid: String? = nil,
    ) {
        self.identifierTypeUuid = identifierTypeUuid
        self.value = value
        self.ebookUuid = ebookUuid
        self.audiobookUuid = audiobookUuid
        self.readaloudUuid = readaloudUuid
    }

    private enum CodingKeys: String, CodingKey {
        case identifierTypeUuid, value, ebookUuid, audiobookUuid, readaloudUuid
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        identifierTypeUuid =
            container.decodeLenient(String.self, forKey: .identifierTypeUuid) ?? ""
        value = container.decodeLenient(String.self, forKey: .value) ?? ""
        ebookUuid = container.decodeLenient(String.self, forKey: .ebookUuid)
        audiobookUuid = container.decodeLenient(String.self, forKey: .audiobookUuid)
        readaloudUuid = container.decodeLenient(String.self, forKey: .readaloudUuid)
    }

    public var isBookLevel: Bool {
        ebookUuid == nil && audiobookUuid == nil && readaloudUuid == nil
    }

    public var asRelationPayload: IdentifierRelationPayload {
        IdentifierRelationPayload(
            identifierTypeUuid: identifierTypeUuid,
            value: value,
            ebookUuid: ebookUuid,
            audiobookUuid: audiobookUuid,
            readaloudUuid: readaloudUuid,
        )
    }
}

public enum IdentifierImportAssembly {
    /// Mirrors the server's own scheme resolution: known kind first, then the type
    /// name case-insensitively. Nil means the caller should create a named type.
    public static func resolveTypeUuid(
        kind: String,
        name: String,
        in types: [IdentifierType],
    ) -> String? {
        if let byKind = types.first(where: { $0.kind == kind }) { return byKind.uuid }
        return types.first {
            $0.name.compare(name, options: .caseInsensitive) == .orderedSame
        }?.uuid
    }
}

/// One element of the `PUT /books/{bookId}/identifiers` body, which replaces the
/// book's WHOLE identifier set. A save must therefore carry the format-linked rows
/// through unchanged (with their format uuids) alongside the edited book-level ones.
public struct IdentifierRelationPayload: Codable, Hashable, Sendable {
    public let identifierTypeUuid: String
    public let value: String
    public let ebookUuid: String?
    public let audiobookUuid: String?
    public let readaloudUuid: String?

    public init(
        identifierTypeUuid: String,
        value: String,
        ebookUuid: String? = nil,
        audiobookUuid: String? = nil,
        readaloudUuid: String? = nil,
    ) {
        self.identifierTypeUuid = identifierTypeUuid
        self.value = value
        self.ebookUuid = ebookUuid
        self.audiobookUuid = audiobookUuid
        self.readaloudUuid = readaloudUuid
    }
}
