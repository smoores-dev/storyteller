import Foundation

extension KeyedDecodingContainer {
    func decodeLenient<T: Decodable>(_ type: T.Type, forKey key: Key) -> T? {
        return (try? decode(T.self, forKey: key)) ?? (try? decodeIfPresent(T.self, forKey: key))
            ?? nil
    }

    func decodeLenientBoolAsInt(forKey key: Key, defaultValue: Int = 0) -> Int {
        if let boolValue = try? decode(Bool.self, forKey: key) {
            return boolValue ? 1 : 0
        } else if let intValue = try? decode(Int.self, forKey: key) {
            return intValue
        } else {
            return defaultValue
        }
    }

    func decodeLenientIntAsBool(forKey key: Key) -> Bool? {
        if let boolValue = try? decodeIfPresent(Bool.self, forKey: key) {
            return boolValue
        } else if let intValue = try? decodeIfPresent(Int.self, forKey: key) {
            return intValue != 0
        } else {
            return nil
        }
    }
}

// Guards server-owned sub-objects whose schema can drift ahead of the app: without
// this, one malformed nested value silently drops the whole book via LenientArrayWrapper.
@propertyWrapper
public struct LenientlyDecoded<Value: Codable & Sendable & Hashable>: Codable, Sendable,
    Hashable
{
    public var wrappedValue: Value?

    public init(wrappedValue: Value?) {
        self.wrappedValue = wrappedValue
    }

    public init(from decoder: Decoder) throws {
        wrappedValue = try? Value(from: decoder)
    }

    public func encode(to encoder: Encoder) throws {
        try wrappedValue.encode(to: encoder)
    }
}

extension KeyedDecodingContainer {
    public func decode<V>(
        _ type: LenientlyDecoded<V>.Type,
        forKey key: Key,
    ) throws -> LenientlyDecoded<V> {
        try decodeIfPresent(type, forKey: key) ?? LenientlyDecoded(wrappedValue: nil)
    }
}

extension KeyedEncodingContainer {
    public mutating func encode<V>(
        _ value: LenientlyDecoded<V>,
        forKey key: Key,
    ) throws {
        try encodeIfPresent(value.wrappedValue, forKey: key)
    }
}

public struct LenientArrayWrapper<T: Decodable>: Decodable {
    public let values: [T]

    public init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var values: [T] = []
        var index = 0

        while !container.isAtEnd {
            do {
                let value = try container.decode(T.self)
                values.append(value)
            } catch {
                debugLog("[MediaModels] Failed to decode array element at index \(index): \(error)")
                if let decodingError = error as? DecodingError {
                    debugLog("[MediaModels] Decoding error details:")
                    switch decodingError {
                        case .typeMismatch(let type, let context):
                            debugLog("[MediaModels]   Type mismatch for \(type)")
                            debugLog(
                                "[MediaModels]   Path: \(context.codingPath.map { $0.stringValue }.joined(separator: " -> "))"
                            )
                        case .valueNotFound(let type, let context):
                            debugLog("[MediaModels]   Value not found for \(type)")
                            debugLog(
                                "[MediaModels]   Path: \(context.codingPath.map { $0.stringValue }.joined(separator: " -> "))"
                            )
                        case .keyNotFound(let key, let context):
                            debugLog("[MediaModels]   Key not found: \(key.stringValue)")
                            debugLog(
                                "[MediaModels]   Path: \(context.codingPath.map { $0.stringValue }.joined(separator: " -> "))"
                            )
                        case .dataCorrupted(let context):
                            debugLog("[MediaModels]   Data corrupted")
                            debugLog(
                                "[MediaModels]   Path: \(context.codingPath.map { $0.stringValue }.joined(separator: " -> "))"
                            )
                        @unknown default:
                            debugLog("[MediaModels]   Unknown error")
                    }
                }
                _ = try? container.decode(FailableDecodable.self)
            }
            index += 1
        }

        self.values = values
    }
}

private struct FailableDecodable: Decodable {
    init(from decoder: Decoder) throws {
        _ = try? decoder.singleValueContainer()
    }
}

public struct BookCreator: Codable, Sendable, Hashable {
    public let uuid: String?
    public let id: Int?
    public let name: String?
    public let fileAs: String?
    public let role: String?
    public let createdAt: String?
    public let updatedAt: String?

    public init(
        uuid: String?,
        id: Int?,
        name: String?,
        fileAs: String?,
        role: String?,
        createdAt: String?,
        updatedAt: String?,
    ) {
        self.uuid = uuid
        self.id = id
        self.name = name
        self.fileAs = fileAs
        self.role = role
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct BookSeries: Codable, Sendable, Hashable {
    public let uuid: String?
    public let name: String
    public let featured: Int
    public let position: Float?
    public let createdAt: String?
    public let updatedAt: String?

    var isFeatured: Bool {
        return featured == 1
    }

    public var formattedPosition: String? {
        guard let position else { return nil }
        if position.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(position))"
        }
        return "\(position)"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        uuid = container.decodeLenient(String.self, forKey: .uuid)
        name = (try? container.decode(String.self, forKey: .name)) ?? ""
        position = container.decodeLenient(Float.self, forKey: .position)
        createdAt = container.decodeLenient(String.self, forKey: .createdAt)
        updatedAt = container.decodeLenient(String.self, forKey: .updatedAt)
        featured = container.decodeLenientBoolAsInt(forKey: .featured, defaultValue: 0)
    }
}

public struct BookTag: Codable, Sendable, Hashable {
    public let uuid: String?
    public let name: String
    public let createdAt: String?
    public let updatedAt: String?
}

public struct BookCollectionSummary: Codable, Sendable, Hashable {
    public let uuid: String?
    public let name: String
    public let description: String?
    public let isPublic: Bool?
    public let importPath: String?
    public let createdAt: String?
    public let updatedAt: String?

    private enum CodingKeys: String, CodingKey {
        case uuid
        case name
        case description
        case isPublic = "public"
        case importPath
        case createdAt
        case updatedAt
    }

    public init(
        uuid: String?,
        name: String,
        description: String?,
        isPublic: Bool?,
        importPath: String?,
        createdAt: String?,
        updatedAt: String?,
    ) {
        self.uuid = uuid
        self.name = name
        self.description = description
        self.isPublic = isPublic
        self.importPath = importPath
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        uuid = container.decodeLenient(String.self, forKey: .uuid)
        name = (try? container.decode(String.self, forKey: .name)) ?? ""
        description = container.decodeLenient(String.self, forKey: .description)
        importPath = container.decodeLenient(String.self, forKey: .importPath)
        createdAt = container.decodeLenient(String.self, forKey: .createdAt)
        updatedAt = container.decodeLenient(String.self, forKey: .updatedAt)
        isPublic = container.decodeLenientIntAsBool(forKey: .isPublic)
    }
}

public struct BookAsset: Codable, Sendable, Hashable {
    public let uuid: String?
    public let filepath: String
    public let missing: Int
    public let isEpub2: Bool?
    public let isEpub3: Bool?
    public let pageCount: Int?
    public let duration: Double?
    public let fileSize: Int?
    public let createdAt: String?
    public let updatedAt: String?
    public let identifiers: [BookIdentifier]?

    public var isMissing: Bool {
        return missing == 1
    }

    public var canUpgradeToEpub3: Bool {
        if isEpub3 == true { return false }
        if isEpub2 == true { return true }
        return isEpub3 == false
    }

    public init(
        uuid: String?,
        filepath: String,
        missing: Int,
        isEpub2: Bool? = nil,
        isEpub3: Bool? = nil,
        pageCount: Int? = nil,
        duration: Double? = nil,
        fileSize: Int? = nil,
        createdAt: String?,
        updatedAt: String?,
        identifiers: [BookIdentifier]? = nil,
    ) {
        self.uuid = uuid
        self.filepath = filepath
        self.missing = missing
        self.isEpub2 = isEpub2
        self.isEpub3 = isEpub3
        self.pageCount = pageCount
        self.duration = duration
        self.fileSize = fileSize
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.identifiers = identifiers
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        uuid = container.decodeLenient(String.self, forKey: .uuid)
        filepath = (try? container.decode(String.self, forKey: .filepath)) ?? ""
        createdAt = container.decodeLenient(String.self, forKey: .createdAt)
        updatedAt = container.decodeLenient(String.self, forKey: .updatedAt)
        missing = container.decodeLenientBoolAsInt(forKey: .missing, defaultValue: 0)
        isEpub2 = container.decodeLenientIntAsBool(forKey: .isEpub2)
        isEpub3 = container.decodeLenientIntAsBool(forKey: .isEpub3)
        pageCount = container.decodeLenient(Int.self, forKey: .pageCount)
        duration = container.decodeLenient(Double.self, forKey: .duration)
        fileSize = container.decodeLenient(Int.self, forKey: .fileSize)
        identifiers = container.decodeLenient([BookIdentifier].self, forKey: .identifiers)
    }
}

public struct BookReadaloud: Codable, Sendable, Hashable {
    public let uuid: String?
    public let filepath: String?
    public let missing: Int
    public let status: String?
    public let currentStage: String?
    public let stageProgress: Double?
    public let queuePosition: Int?
    public let restartPending: Int?
    public let pageCount: Int?
    public let duration: Double?
    public let fileSize: Int?
    public let createdAt: String?
    public let updatedAt: String?
    public let identifiers: [BookIdentifier]?

    public var isMissing: Bool {
        return missing == 1
    }

    public var isRestartPending: Bool {
        return restartPending == 1
    }

    public var friendlyStage: String? {
        switch currentStage?.uppercased() {
            case "SPLIT_TRACKS": return "Splitting Audio"
            case "TRANSCRIBE_CHAPTERS": return "Transcribing"
            case "SYNC_CHAPTERS": return "Syncing"
            default: return currentStage
        }
    }

    public var processingTooltip: String? {
        let s = status?.uppercased() ?? ""
        switch s {
            case "PROCESSING":
                if let stage = friendlyStage, let progress = stageProgress {
                    return "\(stage): \(Int(progress * 100))%"
                }
                return "Processing..."
            case "QUEUED":
                if let pos = queuePosition {
                    return "Queued (#\(pos))"
                }
                return "Queued"
            case "ERROR":
                return "Processing error"
            case "STOPPED":
                return "Processing stopped"
            default:
                return nil
        }
    }

    public init(
        uuid: String?,
        filepath: String?,
        missing: Int,
        status: String?,
        currentStage: String?,
        stageProgress: Double?,
        queuePosition: Int?,
        restartPending: Int?,
        pageCount: Int? = nil,
        duration: Double? = nil,
        fileSize: Int? = nil,
        createdAt: String?,
        updatedAt: String?,
        identifiers: [BookIdentifier]? = nil,
    ) {
        self.uuid = uuid
        self.filepath = filepath
        self.missing = missing
        self.status = status
        self.currentStage = currentStage
        self.stageProgress = stageProgress
        self.queuePosition = queuePosition
        self.restartPending = restartPending
        self.pageCount = pageCount
        self.duration = duration
        self.fileSize = fileSize
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.identifiers = identifiers
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        uuid = container.decodeLenient(String.self, forKey: .uuid)
        filepath = container.decodeLenient(String.self, forKey: .filepath)
        status = container.decodeLenient(String.self, forKey: .status)
        currentStage = container.decodeLenient(String.self, forKey: .currentStage)
        stageProgress = container.decodeLenient(Double.self, forKey: .stageProgress)
        queuePosition = container.decodeLenient(Int.self, forKey: .queuePosition)
        pageCount = container.decodeLenient(Int.self, forKey: .pageCount)
        duration = container.decodeLenient(Double.self, forKey: .duration)
        fileSize = container.decodeLenient(Int.self, forKey: .fileSize)
        createdAt = container.decodeLenient(String.self, forKey: .createdAt)
        updatedAt = container.decodeLenient(String.self, forKey: .updatedAt)
        missing = container.decodeLenientBoolAsInt(forKey: .missing, defaultValue: 0)

        if let intAsBool = container.decodeLenientIntAsBool(forKey: .restartPending) {
            restartPending = intAsBool ? 1 : 0
        } else {
            restartPending = nil
        }
        identifiers = container.decodeLenient([BookIdentifier].self, forKey: .identifiers)
    }
}

public struct BookStatus: Codable, Sendable, Hashable {
    public let uuid: String?
    public let name: String
    public let isDefault: Bool?
    public let createdAt: String?
    public let updatedAt: String?

    public init(
        uuid: String?,
        name: String,
        isDefault: Bool? = nil,
        createdAt: String? = nil,
        updatedAt: String? = nil,
    ) {
        self.uuid = uuid
        self.name = name
        self.isDefault = isDefault
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        uuid = container.decodeLenient(String.self, forKey: .uuid)
        name = (try? container.decode(String.self, forKey: .name)) ?? ""
        createdAt = container.decodeLenient(String.self, forKey: .createdAt)
        updatedAt = container.decodeLenient(String.self, forKey: .updatedAt)
        isDefault = container.decodeLenientIntAsBool(forKey: .isDefault)
    }
}

public struct BookLocator: Codable, Sendable, Hashable {
    public struct Locations: Codable, Sendable, Hashable {
        public struct DomRangeBoundary: Codable, Sendable, Hashable {
            public let cssSelector: String
            public let textNodeIndex: Int
            public let charOffset: Int?

            public init(cssSelector: String, textNodeIndex: Int, charOffset: Int?) {
                self.cssSelector = cssSelector
                self.textNodeIndex = textNodeIndex
                self.charOffset = charOffset
            }
        }

        public struct DomRange: Codable, Sendable, Hashable {
            public let start: DomRangeBoundary
            public let end: DomRangeBoundary?

            public init(start: DomRangeBoundary, end: DomRangeBoundary?) {
                self.start = start
                self.end = end
            }
        }

        public let fragments: [String]?
        public let progression: Double?
        public let position: Int?
        public let totalProgression: Double?
        public let cssSelector: String?
        public let partialCfi: String?
        public let domRange: DomRange?

        enum CodingKeys: String, CodingKey {
            case fragments
            case progression
            case position
            case totalProgression
            case cssSelector
            case partialCfi
            case domRange
        }

        public init(
            fragments: [String]?,
            progression: Double?,
            position: Int?,
            totalProgression: Double?,
            cssSelector: String?,
            partialCfi: String?,
            domRange: DomRange?,
        ) {
            self.fragments = fragments
            self.progression = progression
            self.position = position
            self.totalProgression = totalProgression
            self.cssSelector = cssSelector
            self.partialCfi = partialCfi
            self.domRange = domRange
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            fragments = try? container.decodeIfPresent([String].self, forKey: .fragments)
            progression = container.decodeLenient(Double.self, forKey: .progression)
            position = container.decodeLenient(Int.self, forKey: .position)
            totalProgression = container.decodeLenient(Double.self, forKey: .totalProgression)
            cssSelector = container.decodeLenient(String.self, forKey: .cssSelector)
            partialCfi = container.decodeLenient(String.self, forKey: .partialCfi)
            domRange = try? container.decodeIfPresent(DomRange.self, forKey: .domRange)
        }
    }

    public struct Text: Codable, Sendable, Hashable {
        public let after: String?
        public let before: String?
        public let highlight: String?

        public init(after: String?, before: String?, highlight: String?) {
            self.after = after
            self.before = before
            self.highlight = highlight
        }
    }

    public let href: String
    public let type: String
    public let title: String?
    public let locations: Locations?
    public let text: Text?

    enum CodingKeys: String, CodingKey {
        case href
        case type
        case title
        case locations
        case text
    }

    public init(href: String, type: String, title: String?, locations: Locations?, text: Text?) {
        self.href = href
        self.type = type
        self.title = title
        self.locations = locations
        self.text = text
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        href = try container.decode(String.self, forKey: .href)
        type = try container.decode(String.self, forKey: .type)
        title = container.decodeLenient(String.self, forKey: .title)
        locations = try? container.decodeIfPresent(Locations.self, forKey: .locations)
        text = try? container.decodeIfPresent(Text.self, forKey: .text)
    }
}

public struct BookReadingPosition: Codable, Sendable, Hashable {
    public let uuid: String?
    public let locator: BookLocator?
    public let timestamp: Double?
    public let createdAt: String?
    public let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case uuid
        case locator
        case timestamp
        case createdAt
        case updatedAt
    }

    public init(
        uuid: String?,
        locator: BookLocator?,
        timestamp: Double?,
        createdAt: String?,
        updatedAt: String?,
    ) {
        self.uuid = uuid
        self.locator = locator
        self.timestamp = timestamp
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        uuid = container.decodeLenient(String.self, forKey: .uuid)
        locator = try? container.decodeIfPresent(BookLocator.self, forKey: .locator)
        timestamp = container.decodeLenient(Double.self, forKey: .timestamp)
        createdAt = container.decodeLenient(String.self, forKey: .createdAt)
        updatedAt = container.decodeLenient(String.self, forKey: .updatedAt)
    }
}

public enum SyncResult: Sendable {
    case success
    case queued
    case failed
}

public enum SyncReason: String, Sendable, Codable {
    // User-initiated events (ebook)
    case userFlippedPage
    case userSelectedChapter
    case userDraggedSeekBar

    // User-initiated events (audio)
    case userPausedPlayback
    case userStartedPlayback
    case userSkippedForward
    case userSkippedBackward

    // Timer/system events
    case periodicDuringActivePlayback
    case periodicWhileReading

    // User-initiated events (general)
    case userClosedBook
    case userRestoredFromHistory

    // App lifecycle
    case appBackgrounding
    case appTerminating

    // Connectivity/sync events
    case connectionRestored
    case watchReconnected
    case relayedFromWatch

    // Position fetch triggers
    case initialLoad
    case appWokeFromSleep
}

public struct PendingProgressSync: Codable, Sendable, Hashable {
    public let bookID: BookID
    public let locator: BookLocator
    public let timestamp: Double
    public var syncedToStoryteller: Bool

    public init(
        bookID: BookID,
        locator: BookLocator,
        timestamp: Double,
        syncedToStoryteller: Bool = false,
    ) {
        self.bookID = bookID
        self.locator = locator
        self.timestamp = timestamp
        self.syncedToStoryteller = syncedToStoryteller
    }
}

public struct SyncNotification: Sendable, Equatable {
    public let id: UUID
    public let message: String
    public let type: NotificationType
    public let failedBookIDs: [BookID]

    public enum NotificationType: Sendable, Equatable {
        case success
        case queued
        case error
    }

    public init(message: String, type: NotificationType, failedBookIDs: [BookID] = []) {
        self.id = UUID()
        self.message = message
        self.type = type
        self.failedBookIDs = failedBookIDs
    }
}

public struct SyncHistoryEntry: Codable, Sendable, Hashable {
    public let timestamp: Double
    public let humanTimestamp: String
    public let arrivedAt: Double
    public let humanArrivedAt: String
    public let sourceIdentifier: String
    public let locationDescription: String
    public let reason: SyncReason
    public let result: SyncHistoryResult
    public let locatorSummary: String
    public let locator: BookLocator?

    public enum SyncHistoryResult: String, Codable, Sendable, Hashable {
        // Local update lifecycle (mutable - tracks progress through sync)
        case queued  // Added to pending queue
        case sent  // Server accepted our sync request
        case completed  // Position dequeued (server confirmed or has newer)
        case rejectedAsOlder  // Local position older than server/queue

        // Server update statuses (immutable once recorded)
        case serverIncomingAccepted  // Server position accepted (newer than local)
        case serverIncomingRejected  // Server position rejected (older than local)
    }

    public init(
        timestamp: Double,
        sourceIdentifier: String,
        locationDescription: String,
        reason: SyncReason,
        result: SyncHistoryResult,
        locatorSummary: String,
        locator: BookLocator? = nil,
        arrivedAt: Double? = nil,
    ) {
        self.timestamp = timestamp
        self.humanTimestamp = Self.formatTimestamp(timestamp)
        let arrival = arrivedAt ?? floor(Date().timeIntervalSince1970 * 1000)
        self.arrivedAt = arrival
        self.humanArrivedAt = Self.formatTimestamp(arrival)
        self.sourceIdentifier = sourceIdentifier
        self.locationDescription = locationDescription
        self.reason = reason
        self.result = result
        self.locatorSummary = locatorSummary
        self.locator = locator
    }

    private static func formatTimestamp(_ timestamp: Double) -> String {
        StorytellerDate.shortDateTime(Date(timeIntervalSince1970: timestamp / 1000))
    }
}

public struct SeriesSortKey: Comparable, Hashable, Sendable {
    public let name: String
    public let position: Float

    public static func < (lhs: SeriesSortKey, rhs: SeriesSortKey) -> Bool {
        if lhs.name != rhs.name {
            return lhs.name.articleStrippedCompare(rhs.name) == .orderedAscending
        }
        return lhs.position < rhs.position
    }
}

public struct BookMetadata: Codable, Sendable, Identifiable, Hashable {
    public let id: BookID
    public let title: String
    public let subtitle: String?
    public let description: String?
    public let language: String?
    public let createdAt: String?
    public let updatedAt: String?
    public let publicationDate: String?
    public let authors: [BookCreator]?
    public let narrators: [BookCreator]?
    public let creators: [BookCreator]?
    public let series: [BookSeries]?
    public let tags: [BookTag]?
    public let collections: [BookCollectionSummary]?
    public let ebook: BookAsset?
    public let audiobook: BookAsset?
    public let readaloud: BookReadaloud?
    public let status: BookStatus?
    public let position: BookReadingPosition?
    public let rating: Double?
    public var pageCount: Int? = nil
    public var duration: Double? = nil
    public var alignedAt: String? = nil
    public var alignedByStorytellerVersion: String? = nil
    public var alignedWith: String? = nil
    public var source: String? = nil
    public var alignmentSummary: AlignmentSummary? = nil
    public var identifiers: [BookIdentifier]? = nil

    public var uuid: String { id.uuid }
    public var sourceID: BookSourceID { id.sourceID }

    public init(
        bookID: BookID,
        title: String,
        subtitle: String?,
        description: String?,
        language: String?,
        createdAt: String?,
        updatedAt: String?,
        publicationDate: String?,
        authors: [BookCreator]?,
        narrators: [BookCreator]?,
        creators: [BookCreator]?,
        series: [BookSeries]?,
        tags: [BookTag]?,
        collections: [BookCollectionSummary]?,
        ebook: BookAsset?,
        audiobook: BookAsset?,
        readaloud: BookReadaloud?,
        status: BookStatus?,
        position: BookReadingPosition?,
        rating: Double?,
        pageCount: Int? = nil,
        duration: Double? = nil,
        alignedAt: String? = nil,
        alignedByStorytellerVersion: String? = nil,
        alignedWith: String? = nil,
        source: String? = nil,
        alignmentSummary: AlignmentSummary? = nil,
        identifiers: [BookIdentifier]? = nil,
    ) {
        self.id = bookID
        self.title = title
        self.subtitle = subtitle
        self.description = description
        self.language = language
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.publicationDate = publicationDate
        self.authors = authors
        self.narrators = narrators
        self.creators = creators
        self.series = series
        self.tags = tags
        self.collections = collections
        self.ebook = ebook
        self.audiobook = audiobook
        self.readaloud = readaloud
        self.status = status
        self.position = position
        self.rating = rating
        self.pageCount = pageCount
        self.duration = duration
        self.alignedAt = alignedAt
        self.alignedByStorytellerVersion = alignedByStorytellerVersion
        self.alignedWith = alignedWith
        self.source = source
        self.alignmentSummary = alignmentSummary
        self.identifiers = identifiers
    }

    public var hasAudioNarration: Bool {
        hasAvailableAudiobook || hasAvailableReadaloud
    }

    public var hasAvailableEbook: Bool {
        ebook != nil
    }

    public var hasAvailableAudiobook: Bool {
        audiobook != nil
    }

    public var hasAvailableReadaloud: Bool {
        guard let readaloud else { return false }
        return readaloud.status?.uppercased() == "ALIGNED"
    }

    public var hasAnyAudiobookAsset: Bool {
        hasAvailableAudiobook || hasAvailableReadaloud
    }

    public var isEbookOnly: Bool {
        hasAvailableEbook && !hasAvailableAudiobook && !hasAvailableReadaloud
    }

    public var isAudiobookOnly: Bool {
        hasAvailableAudiobook && !hasAvailableEbook && !hasAvailableReadaloud
    }

    public var isMissingReadaloud: Bool {
        hasAvailableEbook && hasAvailableAudiobook && !hasAvailableReadaloud
    }

    public var canShowCreateReadaloud: Bool {
        guard hasAvailableEbook && hasAvailableAudiobook else { return false }
        guard let readaloud else { return true }
        let status = readaloud.status?.uppercased() ?? ""
        return status == "PROCESSING" || status == "QUEUED" || status == "ERROR"
            || status == "STOPPED"
    }

    public var canUpgradeToEpub3: Bool {
        ebook?.canUpgradeToEpub3 == true
    }

    public var progress: Double {
        let raw =
            position?.locator?.locations?.totalProgression
            ?? position?.locator?.locations?.progression
            ?? 0
        return min(max(raw, 0), 1)
    }

    public var sortableProgress: Double {
        status?.name.lowercased() == "read" ? 1.0 : progress
    }

    // Pages/duration/file size are denormalized onto the book by the server but fall back to the
    // per-asset values so a book still reports them when only the asset carries the number.
    public var pageCountValue: Int? {
        pageCount ?? ebook?.pageCount ?? readaloud?.pageCount
    }

    public var durationValue: Double? {
        duration ?? audiobook?.duration ?? readaloud?.duration
    }

    public var fileSizeValue: Int? {
        let sizes = [ebook?.fileSize, audiobook?.fileSize].compactMap { $0 }
        if !sizes.isEmpty { return sizes.reduce(0, +) }
        // A readaloud-only/synced book carries its size on the readaloud asset; fall back to it
        // rather than reporting blank, mirroring pageCountValue/durationValue.
        return readaloud?.fileSize
    }

    // Numeric sort keys. Missing values coalesce to 0, so they sort as the smallest value (first
    // when ascending, last when descending), consistent with how the app sorts empty string
    // fields.
    public var sortablePages: Int { pageCountValue ?? 0 }
    public var sortableDuration: Double { durationValue ?? 0 }
    public var sortableFileSize: Int { fileSizeValue ?? 0 }

    public var pagesDisplay: String {
        guard let pages = pageCountValue, pages > 0 else { return "" }
        return "\(pages)"
    }

    public var durationDisplay: String {
        guard let seconds = durationValue, seconds > 0 else { return "" }
        return Self.formatDuration(seconds: Int(seconds.rounded()))
    }

    public var fileSizeDisplay: String {
        guard let bytes = fileSizeValue, bytes > 0 else { return "" }
        return Self.formatFileSize(bytes: bytes)
    }

    public static func formatDuration(seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
    }

    public static func formatFileSize(bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    public var tagNames: [String] {
        tags?.compactMap { tag in
            return tag.name.trimmingCharacters(in: .whitespacesAndNewlines)
        } ?? []
    }

    public var sortableAuthor: String {
        authors?.first?.name ?? ""
    }

    public var sortableSeries: SeriesSortKey {
        SeriesSortKey(
            name: series?.first?.name ?? "",
            position: series?.first?.position ?? .greatestFiniteMagnitude,
        )
    }

    public var sortableNarrator: String {
        narrators?.first?.name ?? ""
    }

    public var sortableStatus: String {
        status?.name ?? ""
    }

    public var createdAtValue: Date? {
        StorytellerDate.parse(createdAt, field: .createdAt, context: title)
    }

    public var lastReadValue: Date? {
        StorytellerDate.parse(position?.updatedAt, field: .lastRead, context: title)
    }

    public var alignedAtValue: Date? {
        StorytellerDate.parse(alignedAt, field: .alignedAt, context: title)
    }

    public var publicationDateValue: Date? {
        StorytellerDate.parse(publicationDate, field: .publicationDate, context: title)
    }

    public var sortableAdded: String { StorytellerDate.sortKey(createdAtValue) }

    public var sortableLastRead: String { StorytellerDate.sortKey(lastReadValue) }

    public var sortableTags: String {
        tagNames.joined(separator: ", ")
    }

    public var sortableTranslator: String {
        (creators ?? []).first(where: { $0.role == "trl" })?.name ?? ""
    }

    public var sortableTitle: String { title.articleStripped }

    public var sortableSubtitle: String { subtitle ?? "" }

    public var sortableLanguage: String { language ?? "" }

    public var sortableCollections: String {
        collections?.map(\.name).joined(separator: ", ") ?? ""
    }

    public var sortableAllCreators: String {
        (creators ?? []).compactMap(\.name).joined(separator: ", ")
    }

    public var sortableAlignedAt: String { StorytellerDate.sortKey(alignedAtValue) }

    public var sortableAlignedByVersion: String { alignedByStorytellerVersion ?? "" }

    public var sortableAlignedWith: String { alignedWith ?? "" }

    public var sortableSource: String { source ?? "" }

    /// Book-level plus format-scoped identifiers, deduped by (type name, value).
    /// Audiobook attribution wins on dedupe so a shared ISBN links to Libro.FM.
    public var displayIdentifiers: [BookDisplayIdentifier] {
        let groups: [(rows: [BookIdentifier], isAudiobook: Bool)] = [
            (identifiers ?? [], false),
            (ebook?.identifiers ?? [], false),
            (audiobook?.identifiers ?? [], true),
            (readaloud?.identifiers ?? [], false),
        ]
        let slug = groups.flatMap(\.rows).first { $0.kind == "hardcover-book-slug" }?.value
        var order: [String] = []
        var byKey: [String: (identifier: BookIdentifier, isAudiobook: Bool)] = [:]
        for (rows, isAudiobook) in groups {
            for row in rows {
                let key = "\(row.name.lowercased())|\(row.value.lowercased())"
                if let existing = byKey[key] {
                    byKey[key] = (existing.identifier, existing.isAudiobook || isAudiobook)
                } else {
                    byKey[key] = (row, isAudiobook)
                    order.append(key)
                }
            }
        }
        return order.compactMap { key in
            guard let entry = byKey[key] else { return nil }
            return BookDisplayIdentifier(
                identifier: entry.identifier,
                url: entry.identifier.resolvedURL(
                    audiobookScoped: entry.isAudiobook, hardcoverSlug: slug),
                audiobookScoped: entry.isAudiobook,
            )
        }
    }

    public var identifierList: [BookIdentifier] { displayIdentifiers.map(\.identifier) }

    public var primaryIdentifier: BookIdentifier? {
        let list = identifierList
        if let isbn = list.first(where: { $0.kind == "isbn-13" }) { return isbn }
        return list.min { lhs, rhs in
            lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }

    public var sortableIdentifiers: String {
        primaryIdentifier?.value.lowercased() ?? ""
    }

    public var identifiersDisplay: String {
        identifierList
            .map { "\($0.displayName) \($0.value)" }
            .joined(separator: ", ")
    }

    public func sortableCreator(role: String) -> String {
        (creators ?? []).first(where: { $0.role == role })?.name ?? ""
    }

    public var sortablePublicationYear: String {
        Self.publicationYear(from: publicationDate) ?? ""
    }

    public var sortablePublicationDate: String { StorytellerDate.sortKey(publicationDateValue) }

    public static func publicationYear(from publicationDate: String?) -> String? {
        let year = StorytellerDate.year(StorytellerDate.parse(publicationDate, field: .publicationDate))
        return year.isEmpty ? nil : year
    }
}

public struct BookCover: Sendable {
    public let data: Data
    public let contentType: String?
    public let etag: String?
    public let lastModified: String?
    public let cacheControl: String?
    public let contentDisposition: String?
    public var filepath: String? {
        parseFilename(fromContentDisposition: contentDisposition)
    }

    public init(
        data: Data,
        contentType: String?,
        etag: String?,
        lastModified: String?,
        cacheControl: String?,
        contentDisposition: String?,
    ) {
        self.data = data
        self.contentType = contentType
        self.etag = etag
        self.lastModified = lastModified
        self.cacheControl = cacheControl
        self.contentDisposition = contentDisposition
    }
}

public struct Book: Sendable, Identifiable {
    public var metadata: BookMetadata
    public var ebookCover: BookCover?
    public var audiobookCover: BookCover?
    public var id: BookID { metadata.id }
}

public struct BookLibrary: Sendable {
    public var bookMetaData: [BookMetadata]
    public var ebookCoverCache: [BookID: BookCover?]
    public var audiobookCoverCache: [BookID: BookCover?]

    public init(
        bookMetaData: [BookMetadata],
        ebookCoverCache: [BookID: BookCover?],
        audiobookCoverCache: [BookID: BookCover?],
    ) {
        self.bookMetaData = bookMetaData
        self.ebookCoverCache = ebookCoverCache
        self.audiobookCoverCache = audiobookCoverCache
    }
}
