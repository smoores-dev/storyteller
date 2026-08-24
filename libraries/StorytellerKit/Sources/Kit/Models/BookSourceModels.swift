import Foundation

public typealias BookSourceID = String

public enum BookSourceKind: String, Codable, Sendable, Hashable {
    case storyteller
    case localFolder
}

public struct SourceConnectionInfo: Sendable, Identifiable, Equatable {
    public let id: BookSourceID
    public let name: String
    public let kind: BookSourceKind
    public let status: ConnectionStatus
    public let lastNetworkOpSucceeded: Bool?

    public init(
        id: BookSourceID,
        name: String,
        kind: BookSourceKind,
        status: ConnectionStatus,
        lastNetworkOpSucceeded: Bool? = nil,
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.status = status
        self.lastNetworkOpSucceeded = lastNetworkOpSucceeded
    }
}

public struct BookSourceCapabilities: Codable, Sendable, Hashable {
    public var canEditMetadata: Bool
    public var canManageMedia: Bool
    public var canProcessReadaloud: Bool
    public var canUploadBooks: Bool
    public var canSyncProgress: Bool

    public init(
        canEditMetadata: Bool,
        canManageMedia: Bool,
        canProcessReadaloud: Bool,
        canUploadBooks: Bool,
        canSyncProgress: Bool,
    ) {
        self.canEditMetadata = canEditMetadata
        self.canManageMedia = canManageMedia
        self.canProcessReadaloud = canProcessReadaloud
        self.canUploadBooks = canUploadBooks
        self.canSyncProgress = canSyncProgress
    }
}

public struct BookSourceRecord: Codable, Identifiable, Sendable, Hashable {
    public static let sourceIDFilename = ".storyteller_source_id"
    public static let legacySourceIDFilename = ".silveran_source_id"

    public var id: BookSourceID
    public var name: String
    public var kind: BookSourceKind
    public var capabilities: BookSourceCapabilities
    public var createdAt: String?
    public var updatedAt: String?
    public var storagePath: String?
    public var storageBookmarkData: Data?

    public init(
        id: BookSourceID,
        name: String,
        kind: BookSourceKind,
        capabilities: BookSourceCapabilities,
        createdAt: String? = nil,
        updatedAt: String? = nil,
        storagePath: String? = nil,
        storageBookmarkData: Data? = nil,
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.capabilities = capabilities
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.storagePath = storagePath
        self.storageBookmarkData = storageBookmarkData
    }
}

public struct BookSourceConfiguration: Sendable, Hashable {
    public var kind: BookSourceKind
    public var name: String
    public var serverURL: String?
    public var username: String?
    public var password: String?
    public var sessionToken: String?
    public var storagePath: String?
    public var storageBookmarkData: Data?

    public init(
        kind: BookSourceKind,
        name: String,
        serverURL: String? = nil,
        username: String? = nil,
        password: String? = nil,
        sessionToken: String? = nil,
        storagePath: String? = nil,
        storageBookmarkData: Data? = nil,
    ) {
        self.kind = kind
        self.name = name
        self.serverURL = serverURL
        self.username = username
        self.password = password
        self.sessionToken = sessionToken
        self.storagePath = storagePath
        self.storageBookmarkData = storageBookmarkData
    }
}

public enum LocalMediaLocationKind: String, Sendable, Codable, Hashable {
    case cached
    case source
}

public struct ResolvedLocalMedia: Sendable, Hashable {
    public let bookID: BookID
    public let category: LocalMediaCategory
    public let url: URL
    public let kind: LocalMediaLocationKind

    public var sourceID: BookSourceID { bookID.sourceID }

    public init(
        bookID: BookID,
        category: LocalMediaCategory,
        url: URL,
        kind: LocalMediaLocationKind,
    ) {
        self.bookID = bookID
        self.category = category
        self.url = url
        self.kind = kind
    }
}

public enum EbookFileFormat: String, Sendable, Hashable {
    case epub
    case cbz

    public init(fileURL: URL) {
        self = fileURL.pathExtension.lowercased() == "cbz" ? .cbz : .epub
    }
}

public struct PreparedEbookMedia: Sendable, Hashable {
    public let bookID: BookID
    public let category: LocalMediaCategory
    public let originalURL: URL
    public let readerURL: URL
    public let locationKind: LocalMediaLocationKind

    public var sourceID: BookSourceID { bookID.sourceID }

    public init(
        bookID: BookID,
        category: LocalMediaCategory,
        originalURL: URL,
        readerURL: URL,
        locationKind: LocalMediaLocationKind,
    ) {
        self.bookID = bookID
        self.category = category
        self.originalURL = originalURL
        self.readerURL = readerURL
        self.locationKind = locationKind
    }
}

public enum LocalMediaAvailability: Sendable, Hashable {
    case available(ResolvedLocalMedia)
    case missing
    case offline
}

public enum LibrarySnapshotPolicy: Sendable, Hashable {
    case cachedOnly
    case cachedThenRefresh
    case refresh
}

public enum BookRefreshPolicy: Sendable, Hashable {
    case cachedOnly
    case refresh
    case forceRefresh
}

public enum BookRefreshSource: Sendable, Hashable {
    case cache
    case source
}

public enum CoverLoadPolicy: Sendable, Hashable {
    case cachedThenFetch
    case forceRefresh
}

public enum CoverLoadResponse: Sendable {
    case cached(Data)
    case fetched(BookCover)
    case missing
    case skippedOffline

    public var diagLabel: String {
        switch self {
            case .cached(let data): return "cached(\(data.count)b)"
            case .fetched(let cover): return "fetched(\(cover.data.count)b)"
            case .missing: return "missing"
            case .skippedOffline: return "skippedOffline"
        }
    }
}

public struct BookRefreshResult: Sendable, Hashable {
    public let book: BookMetadata?
    public let source: BookRefreshSource
    public let error: String?

    public init(book: BookMetadata?, source: BookRefreshSource, error: String? = nil) {
        self.book = book
        self.source = source
        self.error = error
    }
}

public struct BookServiceLibrarySnapshot: Sendable {
    public let books: [BookMetadata]
    public let mediaPaths: [BookID: MediaPaths]
    public let cachedMediaPaths: [BookID: MediaPaths]
    public let sources: [BookSourceRecord]

    public init(
        books: [BookMetadata],
        mediaPaths: [BookID: MediaPaths],
        cachedMediaPaths: [BookID: MediaPaths],
        sources: [BookSourceRecord],
    ) {
        self.books = books
        self.mediaPaths = mediaPaths
        self.cachedMediaPaths = cachedMediaPaths
        self.sources = sources
    }
}

extension BookSourceKind {
    public var displayName: String {
        switch self {
            case .storyteller:
                return "Storyteller Server"
            case .localFolder:
                return "Folder Source"
        }
    }

    public var defaultName: String {
        switch self {
            case .storyteller:
                return "My Storyteller Server"
            case .localFolder:
                return "Internal Storage"
        }
    }
}

public struct ExportedBookAssets: Sendable {
    public var ebook: StorytellerUploadAsset?
    public var audiobooks: [StorytellerUploadAsset]
    public var readaloud: StorytellerUploadAsset?

    public init(
        ebook: StorytellerUploadAsset? = nil,
        audiobooks: [StorytellerUploadAsset] = [],
        readaloud: StorytellerUploadAsset? = nil,
    ) {
        self.ebook = ebook
        self.audiobooks = audiobooks
        self.readaloud = readaloud
    }

    public var isEmpty: Bool {
        ebook == nil && audiobooks.isEmpty && readaloud == nil
    }
}

public enum DeleteAssetResult: Sendable {
    case success(BookMetadata)
    case notSupported
    case failed
}

public enum ReplaceAssetResult: Sendable {
    case success
    case notSupported
    case failed
}

public protocol BookSourceActor: Actor {
    var sourceRecord: BookSourceRecord { get async }
    var connectionStatus: ConnectionStatus { get async }

    func fetchLibraryInformation() async -> [BookMetadata]?

    func fetchCoverImage(
        for bookId: String,
        audio: Bool,
        width: Int?,
        height: Int?,
        version: String?,
        ifNoneMatch: String?,
        ifModifiedSince: String?,
    ) async -> BookCover?

    func sendProgressToServer(
        bookId: String,
        locator: BookLocator,
        timestamp: Double,
    ) async -> HTTPResult

    func fetchBookPosition(bookId: String) async -> BookReadingPosition?

    /// Resolves one category to an on-disk URL this source can read right now, hiding the storage
    /// layout (folder: in-folder file; storyteller: per-device download cache). Nil if not local.
    func resolveLocalMedia(
        for bookID: String,
        category: LocalMediaCategory,
    ) async -> ResolvedLocalMedia?

    /// Individual audio files backing a book, in playback order, for export. Empty if none are local.
    func localAudioFiles(for bookID: String) async -> [URL]

    /// Create or merge a book from prepared assets, organizing destination storage as appropriate
    /// (storyteller uploads over HTTP; folder sources write files, guessing the folder layout).
    /// `collectionUUID` adds the new book to a storyteller collection; folder sources ignore it.
    /// Returns the id the book has in this source, nil on failure. That id is not always the
    /// passed `bookUUID`: a folder source's scan can merge the assets into an existing work or
    /// mint its own id for a new one.
    func acceptBook(
        bookUUID: String,
        title: String,
        ebook: StorytellerUploadAsset?,
        audiobooks: [StorytellerUploadAsset],
        readaloud: StorytellerUploadAsset?,
        collectionUUID: String?,
        onProgress: (@Sendable (Double) -> Void)?,
    ) async -> String?

    /// Deletes the book from everything this source owns. Storyteller issues a server DELETE (which
    /// removes the server's files) and then drops the device's downloaded copy from the local media
    /// cache. A folder removes its on-disk files; it has no device cache to clear.
    func deleteBook(_ bookID: String) async -> Bool

    /// Deletes one media category server/folder-side. On success the result carries the book's
    /// refreshed metadata so callers can update without a full refetch; `.notSupported` means an older
    /// storyteller server lacks the per-asset delete endpoint.
    func deleteAsset(_ bookID: String, category: LocalMediaCategory) async -> DeleteAssetResult

    /// Overwrites the book's existing file(s) for `asset`'s category with `asset`. `replaceMetadata`
    /// (storyteller only) lets the new file's metadata overwrite the book record; folder ignores it.
    func replaceAsset(
        _ asset: StorytellerUploadAsset,
        bookID: String,
        replaceMetadata: Bool,
        onProgress: (@Sendable (Double) -> Void)?,
    ) async -> ReplaceAssetResult

    /// Sets the named reading status on the books. Implementations must leave their own cache
    /// consistent so the caller only needs to notify observers, never force a refetch/rescan.
    func updateStatus(forBooks bookIDs: [String], toStatusNamed statusName: String) async -> Bool

    /// Zips a book's local audiobook directory into a Readium `.audiobook` at a temp URL the caller
    /// must delete. Nil when no audiobook is available locally to package.
    func packageAudiobook(for bookID: String) async -> URL?
}

extension BookSourceActor {
    /// Categories whose media is resolvable locally without a network round-trip.
    public func locallyAvailableMedia(for bookID: String) async -> Set<LocalMediaCategory> {
        var result: Set<LocalMediaCategory> = []
        for category in LocalMediaCategory.allCases
        where await resolveLocalMedia(for: bookID, category: category) != nil {
            result.insert(category)
        }
        return result
    }

    /// Reads a book's locally-available media into transferable assets. Returns nil if nothing can be
    /// read. The caller should first confirm availability via `locallyAvailableMedia`.
    public func exportAssets(for bookID: String) async -> ExportedBookAssets? {
        var assets = ExportedBookAssets()

        if let media = await resolveLocalMedia(for: bookID, category: .ebook),
            let data = try? Data(contentsOf: media.url)
        {
            assets.ebook = StorytellerUploadAsset(
                format: .ebook,
                filename: media.url.lastPathComponent,
                data: data,
            )
        }

        if let media = await resolveLocalMedia(for: bookID, category: .synced),
            let data = try? Data(contentsOf: media.url)
        {
            assets.readaloud = StorytellerUploadAsset(
                format: .readaloud,
                filename: media.url.lastPathComponent,
                data: data,
            )
        }

        for url in await localAudioFiles(for: bookID) {
            guard let data = try? Data(contentsOf: url) else { return nil }
            assets.audiobooks.append(
                StorytellerUploadAsset(
                    format: .audiobook,
                    filename: url.lastPathComponent,
                    data: data,
                )
            )
        }

        return assets.isEmpty ? nil : assets
    }
}

extension BookSourceKind {
    /// Ebook container formats this kind of source can store. Storyteller's processing pipeline
    /// only understands epubs; a folder stores whatever file it is given.
    public var acceptedEbookExtensions: Set<String> {
        switch self {
            case .storyteller:
                ["epub"]
            case .localFolder:
                ["epub", "cbz"]
        }
    }
}

public enum CopyDestinations {
    /// Sources that can receive a copy of `book`: not the book's own source, uploads allowed for
    /// the source kind and permitted for the logged-in user, and the destination can store the
    /// book's formats.
    public static func destinations(
        for book: BookMetadata,
        sources: [BookSourceRecord],
        uploadPermittedSourceIDs: Set<BookSourceID>,
    ) -> [BookSourceRecord] {
        sources.filter { record in
            guard record.id != book.sourceID else { return false }
            guard record.capabilities.canUploadBooks else { return false }
            guard uploadPermittedSourceIDs.contains(record.id) else { return false }
            if let ebookExtension = ebookExtension(of: book),
                !record.kind.acceptedEbookExtensions.contains(ebookExtension)
            {
                return false
            }
            return true
        }
    }

    private static func ebookExtension(of book: BookMetadata) -> String? {
        guard let filepath = book.ebook?.filepath else { return nil }
        let ext = URL(fileURLWithPath: filepath).pathExtension.lowercased()
        return ext.isEmpty ? nil : ext
    }
}

extension BookSourceCapabilities {
    public static var storyteller: BookSourceCapabilities {
        BookSourceCapabilities(
            canEditMetadata: true,
            canManageMedia: true,
            canProcessReadaloud: true,
            canUploadBooks: true,
            canSyncProgress: true,
        )
    }

    public static var localFolder: BookSourceCapabilities {
        BookSourceCapabilities(
            canEditMetadata: false,
            canManageMedia: true,
            canProcessReadaloud: false,
            canUploadBooks: true,
            canSyncProgress: true,
        )
    }
}
