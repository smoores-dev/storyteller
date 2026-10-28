import CryptoKit
import Foundation
import StorytellerKit

#if canImport(WidgetKit) && (os(iOS) || os(macOS))
import WidgetKit
#endif

public enum StorytellerWidgetConstants {
    public static let appGroupInfoKey = "STORYTELLER_WIDGET_APP_GROUP"
    public static let fallbackAppGroupIdentifier = "group.dev.smoores.Storyteller"
    public static let readingWidgetKind = "StorytellerReadingWidget"
}

public enum StorytellerWidgetReadingKind: String, Codable, Sendable, Hashable {
    case ebook
    case audiobook
    case readaloud
}

public struct StorytellerWidgetBookSnapshot: Codable, Sendable, Hashable, Identifiable {
    public let bookID: BookID
    public var title: String
    public var authorLine: String
    public var subtitle: String?
    public var summary: String?
    public var sourceName: String?
    public var progress: Double
    public var lastReadAt: Date?
    public var coverFilename: String?
    public var audioCoverFilename: String?
    public var readingKind: StorytellerWidgetReadingKind
    public var isCurrentlyReading: Bool
    public var durationSeconds: Double?
    public var pageCount: Int?
    public var statusName: String?
    // Raw server timestamp string; sorts lexically, matching the home view.
    public var createdAt: String?

    public var id: BookID { bookID }

    public init(
        bookID: BookID,
        title: String,
        authorLine: String,
        subtitle: String?,
        summary: String?,
        sourceName: String?,
        progress: Double,
        lastReadAt: Date?,
        coverFilename: String?,
        audioCoverFilename: String?,
        readingKind: StorytellerWidgetReadingKind,
        isCurrentlyReading: Bool,
        durationSeconds: Double?,
        pageCount: Int?,
        statusName: String?,
        createdAt: String?,
    ) {
        self.bookID = bookID
        self.title = title
        self.authorLine = authorLine
        self.subtitle = subtitle
        self.summary = summary
        self.sourceName = sourceName
        self.progress = min(max(progress, 0), 1)
        self.lastReadAt = lastReadAt
        self.coverFilename = coverFilename
        self.audioCoverFilename = audioCoverFilename
        self.readingKind = readingKind
        self.isCurrentlyReading = isCurrentlyReading
        self.durationSeconds = durationSeconds
        self.pageCount = pageCount
        self.statusName = statusName
        self.createdAt = createdAt
    }

    public var percentComplete: Int {
        Int((progress * 100).rounded())
    }

    public var remainingLabel: String? {
        guard progress < 1 else { return nil }
        let ordered =
            readingKind == .ebook
            ? [pagesRemainingText, timeRemainingText]
            : [timeRemainingText, pagesRemainingText]
        let parts = ordered.compactMap { $0 }
        guard !parts.isEmpty else { return nil }
        return parts.joined(separator: " · ") + " left"
    }

    private var timeRemainingText: String? {
        guard let durationSeconds, durationSeconds > 0 else { return nil }
        let seconds = Int((durationSeconds * (1 - progress)).rounded())
        guard seconds > 0 else { return nil }
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
    }

    private var pagesRemainingText: String? {
        guard let pageCount, pageCount > 0 else { return nil }
        let remaining = Int((Double(pageCount) * (1 - progress)).rounded())
        guard remaining > 0 else { return nil }
        return remaining == 1 ? "1 page" : "\(remaining) pages"
    }
}

public struct StorytellerWidgetSnapshot: Codable, Sendable, Hashable {
    public var generatedAt: Date
    public var books: [StorytellerWidgetBookSnapshot]

    public init(generatedAt: Date = Date(), books: [StorytellerWidgetBookSnapshot]) {
        self.generatedAt = generatedAt
        self.books = books
    }

    public static let empty = StorytellerWidgetSnapshot(books: [])
}

public enum StorytellerWidgetSnapshotStore {
    private static let snapshotFilename = "currently-reading.json"
    private static let coversDirectoryName = "Covers"

    public static func appGroupIdentifier(bundle: Bundle = .main) -> String {
        if let identifier = bundle.object(
            forInfoDictionaryKey: StorytellerWidgetConstants.appGroupInfoKey
        ) as? String,
            !identifier.isEmpty
        {
            return identifier
        }
        return StorytellerWidgetConstants.fallbackAppGroupIdentifier
    }

    public static func sharedContainerURL(bundle: Bundle = .main) -> URL? {
        FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier(bundle: bundle)
        )
    }

    public static func loadSnapshot(bundle: Bundle = .main) -> StorytellerWidgetSnapshot {
        guard let container = sharedContainerURL(bundle: bundle) else {
            return .empty
        }
        return loadSnapshot(from: container)
    }

    public static func loadSnapshot(from container: URL) -> StorytellerWidgetSnapshot {
        let url = snapshotURL(in: container)
        guard let data = try? Data(contentsOf: url) else {
            return .empty
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode(StorytellerWidgetSnapshot.self, from: data)) ?? .empty
    }

    public static func coverURL(for filename: String, bundle: Bundle = .main) -> URL? {
        guard let container = sharedContainerURL(bundle: bundle) else { return nil }
        return coversDirectory(in: container).appendingPathComponent(filename, isDirectory: false)
    }

    @concurrent public static func publishSnapshot(
        metadata: [BookMetadata],
        progress: [BookID: BookProgress],
        sources: [BookSourceRecord],
        container: URL? = nil,
        coverData: @escaping @Sendable (BookID, Bool) async -> Data? = {
            await BookServiceActor.shared.cachedCoverData(for: $0, audio: $1)
        },
    ) async {
        guard let container = container ?? sharedContainerURL() else {
            debugLog("[StorytellerWidgetSnapshotStore] App group container unavailable")
            return
        }

        do {
            try ensureDirectoryExists(at: container)
            try ensureDirectoryExists(at: coversDirectory(in: container))
            var snapshot = makeSnapshot(
                metadata: metadata,
                progress: progress,
                sources: sources,
            )
            try await attachCachedCovers(to: &snapshot, container: container, coverData: coverData)
            try Task.checkCancellation()
            try cleanupStaleCovers(keeping: snapshot.books, container: container)
            try saveSnapshot(snapshot, in: container)
            reloadWidgetTimelines()
        } catch {
            debugLog("[StorytellerWidgetSnapshotStore] Failed to publish snapshot: \(error)")
        }
    }

    public static func makeSnapshot(
        metadata: [BookMetadata],
        progress: [BookID: BookProgress],
        sources: [BookSourceRecord],
    ) -> StorytellerWidgetSnapshot {
        let sourceNames = Dictionary(uniqueKeysWithValues: sources.map { ($0.id, $0.name) })
        let books = metadata.map { book -> StorytellerWidgetBookSnapshot in
            let progressInfo = progress[book.id]
            let effectiveProgress = progressInfo?.progressFraction ?? book.progress
            let statusName = book.status?.name.lowercased() ?? ""
            let isCurrentlyReading =
                statusName == "reading"
                || (statusName != "read" && effectiveProgress > 0 && effectiveProgress < 1)

            return StorytellerWidgetBookSnapshot(
                bookID: book.id,
                title: book.title,
                authorLine: creatorLine(for: book),
                subtitle: trimmedNonEmpty(book.subtitle),
                summary: plainSummary(from: book.description),
                sourceName: book.source ?? sourceNames[book.sourceID],
                progress: effectiveProgress,
                lastReadAt: lastReadDate(for: book, progressInfo: progressInfo),
                coverFilename: nil,
                audioCoverFilename: nil,
                readingKind: readingKind(for: book),
                isCurrentlyReading: isCurrentlyReading,
                durationSeconds: book.durationValue,
                pageCount: book.pageCountValue,
                statusName: statusName.isEmpty ? nil : statusName,
                createdAt: trimmedNonEmpty(book.createdAt),
            )
        }
        .sorted { lhs, rhs in
            if lhs.isCurrentlyReading != rhs.isCurrentlyReading {
                return lhs.isCurrentlyReading
            }
            return readingRecencySort(lhs, rhs)
        }

        return StorytellerWidgetSnapshot(books: books)
    }

    private static func attachCachedCovers(
        to snapshot: inout StorytellerWidgetSnapshot,
        container: URL,
        coverData: @Sendable (BookID, Bool) async -> Data?,
    ) async throws {
        guard !snapshot.books.isEmpty else { return }
        let coversDirectory = coversDirectory(in: container)
        try ensureDirectoryExists(at: coversDirectory)

        for index in snapshot.books.indices {
            try Task.checkCancellation()
            let bookID = snapshot.books[index].bookID
            snapshot.books[index].coverFilename = try await writeCachedCover(
                bookID: bookID,
                audio: false,
                coversDirectory: coversDirectory,
                coverData: coverData,
            )
            snapshot.books[index].audioCoverFilename = try await writeCachedCover(
                bookID: bookID,
                audio: true,
                coversDirectory: coversDirectory,
                coverData: coverData,
            )
        }
    }

    private static func writeCachedCover(
        bookID: BookID,
        audio: Bool,
        coversDirectory: URL,
        coverData: @Sendable (BookID, Bool) async -> Data?,
    ) async throws -> String? {
        guard let data = await coverData(bookID, audio)
        else { return nil }
        // The filename carries a content hash, so a replaced cover gets a new
        // file (the old one is swept by cleanupStaleCovers) and an existing
        // file never needs rewriting.
        let filename = try coverFilename(
            for: bookID,
            audio: audio,
            data: data,
        )
        let url = coversDirectory.appendingPathComponent(filename, isDirectory: false)
        if !FileManager.default.fileExists(atPath: url.path) {
            try data.write(to: url, options: [.atomic])
        }
        return filename
    }

    private static func saveSnapshot(_ snapshot: StorytellerWidgetSnapshot, in container: URL)
        throws
    {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(snapshot)
        try data.write(to: snapshotURL(in: container), options: [.atomic])
    }

    private static func cleanupStaleCovers(
        keeping books: [StorytellerWidgetBookSnapshot],
        container: URL,
    ) throws {
        let keep = Set(books.compactMap(\.coverFilename) + books.compactMap(\.audioCoverFilename))
        let directory = coversDirectory(in: container)
        let contents = try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles],
        )
        for url in contents ?? [] where !keep.contains(url.lastPathComponent) {
            try? FileManager.default.removeItem(at: url)
        }
    }

    private static func snapshotURL(in container: URL) -> URL {
        container.appendingPathComponent(snapshotFilename, isDirectory: false)
    }

    private static func coversDirectory(in container: URL) -> URL {
        container.appendingPathComponent(coversDirectoryName, isDirectory: true)
    }

    private static func ensureDirectoryExists(at url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }

    private static func readingRecencySort(
        _ lhs: StorytellerWidgetBookSnapshot,
        _ rhs: StorytellerWidgetBookSnapshot,
    ) -> Bool {
        switch (lhs.lastReadAt, rhs.lastReadAt) {
            case (let left?, let right?) where left != right:
                return left > right
            case (.some, .none):
                return true
            case (.none, .some):
                return false
            default:
                if lhs.progress != rhs.progress {
                    return lhs.progress > rhs.progress
                }
                return lhs.title.articleStrippedCompare(rhs.title) == .orderedAscending
        }
    }

    private static func creatorLine(for book: BookMetadata) -> String {
        let authorNames = (book.authors ?? []).compactMap { trimmedNonEmpty($0.name) }
        if !authorNames.isEmpty { return authorNames.joined(separator: ", ") }

        let narratorNames = (book.narrators ?? []).compactMap { trimmedNonEmpty($0.name) }
        if !narratorNames.isEmpty { return narratorNames.joined(separator: ", ") }

        let creatorNames = (book.creators ?? []).compactMap { trimmedNonEmpty($0.name) }
        return creatorNames.joined(separator: ", ")
    }

    private static func plainSummary(from description: String?) -> String? {
        guard let description = trimmedNonEmpty(description) else { return nil }
        let stripped = BookDescriptionText.plain(from: description)
        let collapsed =
            stripped
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return trimmedNonEmpty(collapsed)
    }

    private static func lastReadDate(
        for book: BookMetadata,
        progressInfo: BookProgress?,
    ) -> Date? {
        if let timestamp = progressInfo?.timestamp ?? book.position?.timestamp {
            return Date(timeIntervalSince1970: timestamp / 1000)
        }
        return book.lastReadValue
    }

    private static func readingKind(for book: BookMetadata) -> StorytellerWidgetReadingKind {
        if book.hasAvailableReadaloud { return .readaloud }
        if book.hasAvailableEbook { return .ebook }
        return .audiobook
    }

    private static func coverFilename(for bookID: BookID, audio: Bool, data: Data) throws -> String
    {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let identityData = try encoder.encode(bookID)
        let identityToken = SHA256.hash(data: identityData).prefix(12)
            .map { String(format: "%02x", $0) }.joined()
        let contentToken = SHA256.hash(data: data).prefix(8)
            .map { String(format: "%02x", $0) }.joined()
        return "\(identityToken)_\(audio ? "audio" : "text")_\(contentToken).dat"
    }

    private static func trimmedNonEmpty(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func reloadWidgetTimelines() {
        #if canImport(WidgetKit) && (os(iOS) || os(macOS))
        WidgetCenter.shared.reloadTimelines(ofKind: StorytellerWidgetConstants.readingWidgetKind)
        #endif
    }
}
