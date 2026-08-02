import Foundation
import StorytellerKit

public enum WatchProtocolV2 {
    public static let version = 2
    public static let versionKey = "version"
    public static let typeKey = "type"
    public static let payloadKey = "payload"
}

public enum WatchProtocolError: Error, Equatable {
    case missingVersion
    case unsupportedVersion(Int)
    case missingMessageType
    case unknownMessageType(String)
    case missingPayload
}

public struct WatchProtocolContext: Codable, Hashable, Sendable {
    public let phoneSourceList: PhoneSourceList?

    public init(phoneSourceList: PhoneSourceList? = nil) {
        self.phoneSourceList = phoneSourceList
    }
}

public struct PhoneSource: Codable, Hashable, Sendable, Identifiable {
    public let sourceID: BookSourceID
    public let name: String
    public let kind: BookSourceKind
    public let serverURL: String?
    public let username: String?
    public let serverUUID: String?

    public var id: BookSourceID { sourceID }

    public init(
        sourceID: BookSourceID,
        name: String,
        kind: BookSourceKind,
        serverURL: String? = nil,
        username: String? = nil,
        serverUUID: String? = nil,
    ) {
        self.sourceID = sourceID
        self.name = name
        self.kind = kind
        self.serverURL = serverURL
        self.username = username
        self.serverUUID = serverUUID
    }

    public func matchesServer(
        serverURL: String,
        username: String,
        serverUUID: String? = nil,
    ) -> Bool {
        guard kind == .storyteller,
            self.username?.trimmingCharacters(in: .whitespacesAndNewlines)
                == username.trimmingCharacters(in: .whitespacesAndNewlines)
        else { return false }

        let lhsUUID = self.serverUUID?.trimmingCharacters(in: .whitespacesAndNewlines)
        let rhsUUID = serverUUID?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let lhsUUID, !lhsUUID.isEmpty, let rhsUUID, !rhsUUID.isEmpty {
            return lhsUUID == rhsUUID
        }

        guard let ownURL = self.serverURL else { return false }
        return canonicalWatchServerURL(ownURL) == canonicalWatchServerURL(serverURL)
    }
}

public struct PhoneSourceList: Codable, Hashable, Sendable {
    public let sources: [PhoneSource]

    public init(sources: [PhoneSource]) {
        self.sources = sources
    }

    public func source(id: BookSourceID) -> PhoneSource? {
        sources.first { $0.sourceID == id }
    }

    public func matchingServer(
        serverURL: String,
        username: String,
        serverUUID: String? = nil,
    ) -> PhoneSource? {
        sources
            .filter {
                $0.matchesServer(
                    serverURL: serverURL,
                    username: username,
                    serverUUID: serverUUID,
                )
            }
            .sorted { $0.sourceID < $1.sourceID }
            .first
    }
}

private func canonicalWatchServerURL(_ rawValue: String) -> String? {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, var components = URLComponents(string: trimmed) else { return nil }

    components.scheme = components.scheme?.lowercased()
    components.host = components.host?.lowercased()
    guard let scheme = components.scheme, let host = components.host else { return nil }

    let effectivePort: Int?
    if let port = components.port {
        effectivePort = port
    } else {
        switch scheme {
            case "http": effectivePort = 80
            case "https": effectivePort = 443
            default: effectivePort = nil
        }
    }

    var path = components.percentEncodedPath
    while path.count > 1, path.hasSuffix("/") {
        path.removeLast()
    }
    if path == "/" { path = "" }

    return [scheme, host, effectivePort.map(String.init) ?? "", path]
        .joined(separator: "|")
}

public struct WatchFailure: Codable, Hashable, Sendable {
    public let message: String

    public init(message: String) {
        self.message = message
    }
}

public struct WatchProgressPayload: Codable, Hashable, Sendable {
    public let watchBookID: BookID
    public let phoneBookID: BookID
    public let locator: BookLocator
    public let timestamp: Double

    public init(
        watchBookID: BookID,
        phoneBookID: BookID,
        locator: BookLocator,
        timestamp: Double,
    ) {
        self.watchBookID = watchBookID
        self.phoneBookID = phoneBookID
        self.locator = locator
        self.timestamp = timestamp
    }
}

public struct WatchProgressReceipt: Codable, Hashable, Sendable {
    public let watchBookID: BookID
    public let timestamp: Double

    public init(watchBookID: BookID, timestamp: Double) {
        self.watchBookID = watchBookID
        self.timestamp = timestamp
    }
}

public struct WatchDeleteBookPayload: Codable, Hashable, Sendable {
    public let bookID: BookID
    public let category: LocalMediaCategory

    public init(bookID: BookID, category: LocalMediaCategory) {
        self.bookID = bookID
        self.category = category
    }
}

public struct WatchTransferReference: Codable, Hashable, Sendable {
    public let transferID: UUID

    public init(transferID: UUID) {
        self.transferID = transferID
    }
}

public struct WatchTransferFailure: Codable, Hashable, Sendable {
    public let transferID: UUID
    public let message: String

    public init(transferID: UUID, message: String) {
        self.transferID = transferID
        self.message = message
    }
}

public struct WatchChunkTransferPayload: Codable, Hashable, Sendable {
    public let transferID: UUID
    public let phoneBookID: BookID
    public let category: LocalMediaCategory
    public let chunkIndex: Int
    public let totalChunks: Int
    public let totalFileSize: Int64
    public let fileExtension: String
    public let title: String
    public let authors: [String]
    public let bookMetadata: BookMetadata

    public init(
        transferID: UUID,
        phoneBookID: BookID,
        category: LocalMediaCategory,
        chunkIndex: Int,
        totalChunks: Int,
        totalFileSize: Int64,
        fileExtension: String,
        title: String,
        authors: [String],
        bookMetadata: BookMetadata,
    ) {
        self.transferID = transferID
        self.phoneBookID = phoneBookID
        self.category = category
        self.chunkIndex = chunkIndex
        self.totalChunks = totalChunks
        self.totalFileSize = totalFileSize
        self.fileExtension = fileExtension
        self.title = title
        self.authors = authors
        self.bookMetadata = bookMetadata
    }
}

public struct WatchCredentialRequest: Codable, Hashable, Sendable {
    public let phoneSourceID: BookSourceID

    public init(phoneSourceID: BookSourceID) {
        self.phoneSourceID = phoneSourceID
    }
}

public struct WatchCredentialReply: Codable, Hashable, Sendable {
    public let phoneSourceID: BookSourceID
    public let name: String
    public let serverURL: String
    public let username: String
    public let password: String
    public let serverUUID: String?

    public init(
        phoneSourceID: BookSourceID,
        name: String,
        serverURL: String,
        username: String,
        password: String,
        serverUUID: String? = nil,
    ) {
        self.phoneSourceID = phoneSourceID
        self.name = name
        self.serverURL = serverURL
        self.username = username
        self.password = password
        self.serverUUID = serverUUID
    }
}

public struct WatchBookInfo: Codable, Hashable, Sendable, Identifiable {
    public struct ID: Codable, Hashable, Sendable {
        public let bookID: BookID
        public let category: LocalMediaCategory

        public init(bookID: BookID, category: LocalMediaCategory) {
            self.bookID = bookID
            self.category = category
        }
    }

    public let id: ID
    public let phoneBookID: BookID?
    public let title: String
    public let authorNames: [String]
    public let sizeBytes: Int64

    public var bookID: BookID { id.bookID }
    public var category: LocalMediaCategory { id.category }
    public var authorDisplay: String { authorNames.joined(separator: ", ") }

    public init(
        bookID: BookID,
        phoneBookID: BookID? = nil,
        title: String,
        authorNames: [String],
        category: LocalMediaCategory,
        sizeBytes: Int64,
    ) {
        id = ID(bookID: bookID, category: category)
        self.phoneBookID = phoneBookID
        self.title = title
        self.authorNames = authorNames
        self.sizeBytes = sizeBytes
    }
}

public struct WatchLibrary: Codable, Hashable, Sendable {
    public let books: [WatchBookInfo]

    public init(books: [WatchBookInfo]) {
        self.books = books
    }
}

public struct WatchLibraryMetadataResponse: Codable, Hashable, Sendable {
    public let books: [BookMetadata]

    public init(books: [BookMetadata]) {
        self.books = books
    }
}

public enum WatchProtocolMessage: Hashable, Sendable {
    public enum Kind: String, Codable, Hashable, Sendable {
        case context
        case ping
        case pong
        case acknowledgement
        case failure
        case progress
        case progressReceived
        case deleteBook
        case cancelTransfer
        case transferComplete
        case transferFailed
        case chunkTransfer
        case sourceCatalogRequest
        case sourceCatalog
        case credentialRequest
        case credentialReply
        case watchLibraryRequest
        case watchLibrary
        case libraryMetadataRequest
        case libraryMetadataResponse
        case playbackStateRequest
        case playbackState
        case noPlaybackState
        case playbackCommand
    }

    case context(WatchProtocolContext)
    case ping
    case pong
    case acknowledgement
    case failure(WatchFailure)
    case progress(WatchProgressPayload)
    case progressReceived(WatchProgressReceipt)
    case deleteBook(WatchDeleteBookPayload)
    case cancelTransfer(WatchTransferReference)
    case transferComplete(WatchTransferReference)
    case transferFailed(WatchTransferFailure)
    case chunkTransfer(WatchChunkTransferPayload)
    case sourceCatalogRequest
    case sourceCatalog(PhoneSourceList)
    case credentialRequest(WatchCredentialRequest)
    case credentialReply(WatchCredentialReply)
    case watchLibraryRequest
    case watchLibrary(WatchLibrary)
    case libraryMetadataRequest
    case libraryMetadataResponse(WatchLibraryMetadataResponse)
    case playbackStateRequest
    case playbackState(RemotePlaybackState)
    case noPlaybackState
    case playbackCommand(RemotePlaybackCommand)

    public var kind: Kind {
        switch self {
            case .context: .context
            case .ping: .ping
            case .pong: .pong
            case .acknowledgement: .acknowledgement
            case .failure: .failure
            case .progress: .progress
            case .progressReceived: .progressReceived
            case .deleteBook: .deleteBook
            case .cancelTransfer: .cancelTransfer
            case .transferComplete: .transferComplete
            case .transferFailed: .transferFailed
            case .chunkTransfer: .chunkTransfer
            case .sourceCatalogRequest: .sourceCatalogRequest
            case .sourceCatalog: .sourceCatalog
            case .credentialRequest: .credentialRequest
            case .credentialReply: .credentialReply
            case .watchLibraryRequest: .watchLibraryRequest
            case .watchLibrary: .watchLibrary
            case .libraryMetadataRequest: .libraryMetadataRequest
            case .libraryMetadataResponse: .libraryMetadataResponse
            case .playbackStateRequest: .playbackStateRequest
            case .playbackState: .playbackState
            case .noPlaybackState: .noPlaybackState
            case .playbackCommand: .playbackCommand
        }
    }

    public func encode(using encoder: JSONEncoder = JSONEncoder()) throws -> [String: Any] {
        let payload: Data
        switch self {
            case .context(let value):
                payload = try encoder.encode(value)
            case .ping, .pong, .acknowledgement, .sourceCatalogRequest,
                .watchLibraryRequest, .libraryMetadataRequest, .playbackStateRequest,
                .noPlaybackState:
                payload = try encoder.encode(EmptyPayload())
            case .failure(let value):
                payload = try encoder.encode(value)
            case .progress(let value):
                payload = try encoder.encode(value)
            case .progressReceived(let value):
                payload = try encoder.encode(value)
            case .deleteBook(let value):
                payload = try encoder.encode(value)
            case .cancelTransfer(let value), .transferComplete(let value):
                payload = try encoder.encode(value)
            case .transferFailed(let value):
                payload = try encoder.encode(value)
            case .chunkTransfer(let value):
                payload = try encoder.encode(value)
            case .sourceCatalog(let value):
                payload = try encoder.encode(value)
            case .credentialRequest(let value):
                payload = try encoder.encode(value)
            case .credentialReply(let value):
                payload = try encoder.encode(value)
            case .watchLibrary(let value):
                payload = try encoder.encode(value)
            case .libraryMetadataResponse(let value):
                payload = try encoder.encode(value)
            case .playbackState(let value):
                payload = try encoder.encode(value)
            case .playbackCommand(let value):
                payload = try encoder.encode(value)
        }

        return [
            WatchProtocolV2.versionKey: WatchProtocolV2.version,
            WatchProtocolV2.typeKey: kind.rawValue,
            WatchProtocolV2.payloadKey: payload,
        ]
    }

    public static func decode(
        from envelope: [String: Any],
        using decoder: JSONDecoder = JSONDecoder(),
    ) throws -> WatchProtocolMessage {
        guard let version = envelope[WatchProtocolV2.versionKey] as? Int else {
            throw WatchProtocolError.missingVersion
        }
        guard version == WatchProtocolV2.version else {
            throw WatchProtocolError.unsupportedVersion(version)
        }
        guard let rawKind = envelope[WatchProtocolV2.typeKey] as? String else {
            throw WatchProtocolError.missingMessageType
        }
        guard let kind = Kind(rawValue: rawKind) else {
            throw WatchProtocolError.unknownMessageType(rawKind)
        }
        guard let payload = envelope[WatchProtocolV2.payloadKey] as? Data else {
            throw WatchProtocolError.missingPayload
        }

        switch kind {
            case .context:
                return .context(try decoder.decode(WatchProtocolContext.self, from: payload))
            case .ping:
                _ = try decoder.decode(EmptyPayload.self, from: payload)
                return .ping
            case .pong:
                _ = try decoder.decode(EmptyPayload.self, from: payload)
                return .pong
            case .acknowledgement:
                _ = try decoder.decode(EmptyPayload.self, from: payload)
                return .acknowledgement
            case .failure:
                return .failure(try decoder.decode(WatchFailure.self, from: payload))
            case .progress:
                return .progress(try decoder.decode(WatchProgressPayload.self, from: payload))
            case .progressReceived:
                return .progressReceived(
                    try decoder.decode(WatchProgressReceipt.self, from: payload)
                )
            case .deleteBook:
                return .deleteBook(
                    try decoder.decode(WatchDeleteBookPayload.self, from: payload)
                )
            case .cancelTransfer:
                return .cancelTransfer(
                    try decoder.decode(WatchTransferReference.self, from: payload)
                )
            case .transferComplete:
                return .transferComplete(
                    try decoder.decode(WatchTransferReference.self, from: payload)
                )
            case .transferFailed:
                return .transferFailed(
                    try decoder.decode(WatchTransferFailure.self, from: payload)
                )
            case .chunkTransfer:
                return .chunkTransfer(
                    try decoder.decode(WatchChunkTransferPayload.self, from: payload)
                )
            case .sourceCatalogRequest:
                _ = try decoder.decode(EmptyPayload.self, from: payload)
                return .sourceCatalogRequest
            case .sourceCatalog:
                return .sourceCatalog(try decoder.decode(PhoneSourceList.self, from: payload))
            case .credentialRequest:
                return .credentialRequest(
                    try decoder.decode(WatchCredentialRequest.self, from: payload)
                )
            case .credentialReply:
                return .credentialReply(
                    try decoder.decode(WatchCredentialReply.self, from: payload)
                )
            case .watchLibraryRequest:
                _ = try decoder.decode(EmptyPayload.self, from: payload)
                return .watchLibraryRequest
            case .watchLibrary:
                return .watchLibrary(try decoder.decode(WatchLibrary.self, from: payload))
            case .libraryMetadataRequest:
                _ = try decoder.decode(EmptyPayload.self, from: payload)
                return .libraryMetadataRequest
            case .libraryMetadataResponse:
                return .libraryMetadataResponse(
                    try decoder.decode(WatchLibraryMetadataResponse.self, from: payload)
                )
            case .playbackStateRequest:
                _ = try decoder.decode(EmptyPayload.self, from: payload)
                return .playbackStateRequest
            case .playbackState:
                return .playbackState(try decoder.decode(RemotePlaybackState.self, from: payload))
            case .noPlaybackState:
                _ = try decoder.decode(EmptyPayload.self, from: payload)
                return .noPlaybackState
            case .playbackCommand:
                return .playbackCommand(
                    try decoder.decode(RemotePlaybackCommand.self, from: payload)
                )
        }
    }
}

private struct EmptyPayload: Codable {}
