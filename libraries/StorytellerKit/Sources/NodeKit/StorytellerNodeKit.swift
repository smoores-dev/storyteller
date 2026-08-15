import Foundation
import NodeAPI
import StorytellerKit

#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

private struct ConfigureOptions: Decodable {
    let tokens: [String: String]?
}

private enum ConfigureError: Error {
    case unknownProvider(String)
}

private struct MetadataQuery: Decodable {
    let providers: [BookMetadataProvider]?
    let provider: BookMetadataProvider?
    let title: String?
    let author: String?
    let query: String?
    let region: String?

    var searchTitle: String { title ?? query ?? "" }

    /// An unqualified request means every provider whose credentials are configured.
    func requestedProviders(configured: (BookMetadataProvider) -> Bool) -> [BookMetadataProvider] {
        if let providers { return providers }
        if let provider { return [provider] }
        return BookMetadataProvider.allCases.filter { !$0.requiresToken || configured($0) }
    }
}

private struct MetadataBookQuery: Decodable {
    let provider: BookMetadataProvider
    let id: String
    let region: String?
}

private struct CoverQuery: Decodable {
    let providers: [CoverProvider]?
    let provider: CoverProvider?
    let title: String?
    let author: String?
    let query: String?

    var searchTitle: String { title ?? query ?? "" }

    func requestedProviders(configured: (CoverProvider) -> Bool) -> [CoverProvider] {
        if let providers { return providers }
        if let provider { return [provider] }
        return CoverProvider.allCases.filter { !$0.requiresToken || configured($0) }
    }
}

private struct DownloadQuery: Decodable {
    let url: String
    let provider: CoverProvider?
    let filename: String?
}

private func json(_ value: some Encodable) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    return String(decoding: try encoder.encode(value), as: UTF8.self)
}

private func decode<T: Decodable>(_ type: T.Type, from options: String) throws -> T {
    try JSONDecoder().decode(type, from: Data(options.utf8))
}

private func searchMetadata(_ query: MetadataQuery) async throws -> [BookMetadataSearchResult] {
    let configured = await HardcoverActor.shared.hasToken
    var results: [BookMetadataSearchResult] = []
    for provider in query.requestedProviders(configured: { _ in configured }) {
        switch provider {
            case .audnexus:
                let hits = try await AudnexusActor.shared.searchBooks(
                    title: query.searchTitle,
                    author: query.author,
                    region: query.region ?? "us",
                )
                results += hits.map(\.asMetadataSearchResult)
            case .hardcover:
                let terms = [query.searchTitle, query.author].compactMap { $0 }
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                    .joined(separator: " ")
                let hits = try await HardcoverActor.shared.searchBooks(query: terms)
                results += hits.map(\.asMetadataSearchResult)
        }
    }
    return results
}

private func fetchCandidate(_ query: MetadataBookQuery) async throws -> BookMetadataCandidate {
    switch query.provider {
        case .audnexus:
            let details = try await AudnexusActor.shared.fetchBookDetails(
                asin: query.id,
                region: query.region ?? "us",
            )
            return details.asMetadataCandidate
        case .hardcover:
            guard let id = Int(query.id) else { throw HardcoverError.invalidBookID(query.id) }
            return try await HardcoverActor.shared.fetchBookDetails(id: id)
    }
}

private func searchCovers(_ query: CoverQuery) async throws -> [CoverCandidate] {
    let configured = await HardcoverActor.shared.hasToken
    var covers: [CoverCandidate] = []
    for provider in query.requestedProviders(configured: { _ in configured }) {
        switch provider {
            case .apple:
                covers += try await CoverSearch.apple(
                    title: query.searchTitle,
                    author: query.author,
                )
            case .hardcover:
                covers += try await CoverSearch.hardcover(
                    title: query.searchTitle,
                    author: query.author,
                )
        }
    }
    return covers
}

private func metadataSearchJSON(_ options: String) async throws -> String {
    try json(try await searchMetadata(decode(MetadataQuery.self, from: options)))
}

private func applyConfiguration(_ options: String) async throws {
    let config = try decode(ConfigureOptions.self, from: options)
    var hardcoverToken: String?
    for (name, token) in config.tokens ?? [:] {
        switch name {
            case "hardcover": hardcoverToken = token
            default: throw ConfigureError.unknownProvider(name)
        }
    }
    await HardcoverActor.shared.setToken(hardcoverToken)
}

private func metadataBookJSON(_ options: String) async throws -> String {
    let query = try decode(MetadataBookQuery.self, from: options)
    return try json(try await fetchCandidate(query))
}

private func metadataBookRawJSON(_ options: String) async throws -> String {
    let query = try decode(MetadataBookQuery.self, from: options)
    return try await fetchCandidate(query).rawJSON ?? "{}"
}

private func coverSearchJSON(_ options: String) async throws -> String {
    try json(try await searchCovers(decode(CoverQuery.self, from: options)))
}

// The dictionary's value type has to be exactly `NodePropertyConvertible`: that is the only element
// type NodeAPI's Dictionary conformance covers, and a near miss silently resolves to the Void
// overload of NodeFunction, which hands JS back `undefined`.
@NodeActor
private func downloadPayload(_ options: String) async throws -> [String: NodePropertyConvertible] {
    let query = try decode(DownloadQuery.self, from: options)
    guard let url = URL(string: query.url) else {
        throw CoverDownloadError.invalidURL(query.url)
    }
    let cover = try await CoverDownload.fetch(
        url: url,
        provider: query.provider,
        fallbackFilename: query.filename ?? "cover.jpg",
    )
    let bytes = try NodeBuffer(copying: cover.data)
    return [
        "filename": cover.filename,
        "contentType": cover.contentType,
        "url": cover.url.absoluteString,
        "width": cover.width,
        "height": cover.height,
        "bytes": bytes,
    ]
}

#NodeModule(exports: [
    "configure": try NodeFunction { (options: String) in
        try await applyConfiguration(options)
    },
    "metadataSearch": try NodeFunction { (options: String) in
        try await metadataSearchJSON(options)
    },
    "metadataBook": try NodeFunction { (options: String) in
        try await metadataBookJSON(options)
    },
    "metadataBookRaw": try NodeFunction { (options: String) in
        try await metadataBookRawJSON(options)
    },
    "coverSearch": try NodeFunction { (options: String) in
        try await coverSearchJSON(options)
    },
    "download": try NodeFunction { (options: String) in
        try await downloadPayload(options)
    },
])
